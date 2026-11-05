import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptExplanation, { CONCEPT_LIMIT_MESSAGE } from './ConceptExplanation';

jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => jest.fn());
jest.mock('remark-math', () => jest.fn());
jest.mock('rehype-katex', () => jest.fn());

const props = { contextId: 'question-context', backendUrl: 'http://localhost:5000', token: 'test-token',
  anonymousId: 'test-anonymous-id', language: 'zh' };
const answer = '导数是变化率。积分计算累积量。';
const successful = data => ({ ok: true, json: async () => data });
const initial = (extra = {}) => ({ sessionId: 'session-1', selectedText: '导数', turnCount: 1, status: 'active',
  messages: [{ role: 'assistant', content: '导数描述函数的局部变化率。', citations: [{ title: 'Calculus', url: 'https://example.org/calculus' }] }], ...extra });
let testContextId;
const mount = (extra = {}) => render(<ConceptExplanation {...props} contextId={testContextId} {...extra}><p data-testid="answer">{answer}</p></ConceptExplanation>);
function select(start = 0, end = 2) {
  const text = screen.getByTestId('answer').firstChild;
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}
async function start() {
  select();
  fireEvent.click(screen.getByRole('button', { name: 'ChatGPT 解释' }));
  await screen.findByText('导数描述函数的局部变化率。');
}

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  testContextId = globalThis.crypto.randomUUID();
  global.fetch = jest.fn().mockResolvedValue(successful({}));
});
afterEach(() => { jest.restoreAllMocks(); window.getSelection().removeAllRanges(); });

test('requires a current homework context', () => {
  mount({ contextId: null });
  select();
  expect(screen.getByText('重新生成作业答案后，即可使用选中文本解释。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /ChatGPT 解释/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test('explains selected answer text with context, authentication and genuine source links', async () => {
  fetch.mockResolvedValueOnce(successful(initial()));
  mount();
  await start();
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('http://localhost:5000/api/concept-explanations/start');
  expect(JSON.parse(request.body)).toEqual(expect.objectContaining({ contextId: testContextId, selectedText: '导数', revision: 1,
    anonymousId: 'test-anonymous-id', clientId: expect.any(String) }));
  expect(request.headers.Authorization).toBe('Bearer test-token');
  expect(screen.getByRole('link', { name: 'Calculus' })).toHaveAttribute('href', 'https://example.org/calculus');
  expect(screen.getByText('1/2 轮')).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
  const saved = JSON.parse(sessionStorage.getItem('conceptChannelMetadata'));
  expect(saved.length).toBeLessThanOrEqual(64);
  expect(saved.find(item => item.contextId === testContextId)).toEqual({
    contextId: testContextId, clientId: JSON.parse(request.body).clientId, revision: 1,
  });
  for (const entry of saved) expect(Object.keys(entry).sort()).toEqual(['clientId', 'contextId', 'revision']);
  expect(sessionStorage.getItem('conceptChannelMetadata')).not.toMatch(/导数|变化率|Calculus/);
});

test('allows one follow-up, then presents the fixed third-submission notice and exports server context', async () => {
  fetch.mockResolvedValueOnce(successful(initial()))
    .mockResolvedValueOnce(successful(initial({ turnCount: 2, messages: [
      ...initial().messages, { role: 'user', content: '为什么是局部？' }, { role: 'assistant', content: '因为它取极限。' },
    ] })))
    .mockResolvedValueOnce(successful(initial({ status: 'limited', turnCount: 2, message: CONCEPT_LIMIT_MESSAGE })))
    .mockResolvedValueOnce(successful({ markdown: '# 完整题目\n原图、答案与对话', filename: 'context.md' }));
  URL.createObjectURL = jest.fn(() => 'blob:context');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mount();
  await start();
  fireEvent.change(screen.getByLabelText('围绕这个概念追问一次'), { target: { value: '为什么是局部？' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await screen.findByText('因为它取极限。');
  expect(screen.getByText('2/2 轮')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('围绕这个概念追问一次'), { target: { value: '再解释一次' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await screen.findByText(CONCEPT_LIMIT_MESSAGE);
  expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导出上下文' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[3][0]).toContain('/session-1/export?anonymousId=test-anonymous-id');
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
});

test('refusal ends the conversation immediately and disables follow-up', async () => {
  fetch.mockResolvedValueOnce(successful(initial({ status: 'refused', messages: [{ role: 'assistant', content: '无法理解这段文本。' }] })));
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT 解释/ }));
  await screen.findByText('无法理解这段文本。');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
  expect(screen.getByText('本次解释已结束。可以选择其他文本开始新的解释。')).toBeInTheDocument();
});

test('a new selection removes the old conversation, aborts its request and ignores late responses', async () => {
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(successful(initial({ sessionId: 'session-new', selectedText: '积分', messages: [{ role: 'assistant', content: '积分是累积。' }] })));
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT 解释/ }));
  const oldSignal = fetch.mock.calls[0][1].signal;
  select(7, 9);
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT 解释/ }));
  await screen.findByText('积分是累积。');
  expect(oldSignal.aborted).toBe(true);
  expect(JSON.parse(fetch.mock.calls[1][1].body).revision).toBe(2);
  await act(async () => { resolveOld(successful(initial())); });
  expect(screen.queryByText('导数描述函数的局部变化率。')).not.toBeInTheDocument();
  expect(screen.getByText('积分是累积。')).toBeInTheDocument();
});

test('closing cancels an in-flight start and sends a higher-revision deletion tombstone', async () => {
  let resolveStart;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveStart = resolve; }));
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT 解释/ }));
  const signal = fetch.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button', { name: '关闭解释' }));
  expect(signal.aborted).toBe(true);
  const [url, request] = fetch.mock.calls[1];
  expect(url).toMatch(/\/channel$/);
  expect(request.method).toBe('DELETE');
  expect(JSON.parse(request.body).revision).toBe(2);
  await act(async () => resolveStart(successful(initial())));
  expect(screen.queryByRole('region', { name: '关键词解释' })).not.toBeInTheDocument();
});

test('expired contexts explain how to recover', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ code: 'CONCEPT_CONTEXT_EXPIRED', message: 'Expired' }) });
  mount();
  select();
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT 解释/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('题目上下文已过期，请重新生成作业答案后再解释。');
});

test('revisiting one result reuses its channel and keeps increasing the deletion revision', async () => {
  fetch.mockImplementation(async (_url, request) => successful(request.method === 'POST' ? initial() : {}));
  for (let visit = 0; visit < 10; visit += 1) {
    const { unmount } = mount();
    await start();
    unmount();
  }
  const starts = fetch.mock.calls.filter(([url]) => url.endsWith('/start')).map(([, request]) => JSON.parse(request.body));
  const deletions = fetch.mock.calls.filter(([url]) => url.endsWith('/channel')).map(([, request]) => JSON.parse(request.body));
  expect(new Set(starts.map(item => item.clientId)).size).toBe(1);
  expect(starts.map(item => item.revision)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  expect(deletions.map(item => item.revision)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  expect(JSON.parse(sessionStorage.getItem('conceptChannelMetadata')).find(item => item.contextId === testContextId).revision).toBe(20);
});
