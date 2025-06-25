import axios from 'axios';

let api = axios.create({
  baseURL: 'http://localhost:4000/api',
  withCredentials: true,
});

let articleId = '';
let commentId = '';

beforeAll(async () => {
  const login = await api.post('/auth/login', {
    email: 'evo1alvin1@gmail.com',
    password: 'Alvin_890',
  });

  const cookies = login.headers['set-cookie'];
  if (!cookies || cookies.length === 0) {
    throw new Error('No cookies returned from login');
  }

  // Recreate axios instance with Cookie header
  api = axios.create({
    baseURL: 'http://localhost:4000/api',
    headers: {
      Cookie: cookies.join('; '),
    },
    withCredentials: true,
  });

  const articlesRes = await api.get('/articles');
  articleId = articlesRes.data.data[0].id;
});


test('Update user profile', async () => {
  const res = await api.put('/auth/profile', {
    name: 'Muhammad Alvin Firdaus',
    bio: 'Bioooo2',
  });

  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);
});

test('Bookmark an article', async () => {
  const res = await api.post(`/interactions/bookmarks/${articleId}`);
  expect([200, 201]).toContain(res.status);
  expect(res.data.success).toBe(true);
});

test('Post a comment', async () => {
  const res = await api.post(`/interactions/comments/${articleId}`, {
    content: 'Test comment from GitHub Actions',
  });

  commentId = res.data.data.id;

  expect([200, 201]).toContain(res.status);
  expect(res.data.success).toBe(true);
  expect(typeof commentId).toBe('string');
});

test('Check reading history', async () => {
  const res = await api.get('/interactions/reading-history');
  expect(Array.isArray(res.data.data)).toBe(true);
});