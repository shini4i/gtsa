import type { AxiosInstance } from 'axios';
import { AxiosHttpTransport } from './httpTransport';

describe('AxiosHttpTransport', () => {
  it('delegates to axios and normalises headers', async () => {
    const request = jest.fn().mockResolvedValue({
      data: { ok: true },
      headers: {
        'set-cookie': ['cookie-a', 'cookie-b'],
        single: 'value',
        empty: undefined,
      },
      status: 200,
    });
    const client = { request } as unknown as AxiosInstance;
    const transport = new AxiosHttpTransport(client);

    const response = await transport.request({ method: 'get', url: '/path' });

    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/path',
      data: undefined,
      headers: undefined,
      params: undefined,
    });
    expect(response).toEqual({
      data: { ok: true },
      headers: {
        'set-cookie': 'cookie-a, cookie-b',
        single: 'value',
      },
      status: 200,
    });
  });
});
