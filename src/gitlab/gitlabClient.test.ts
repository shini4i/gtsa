import MockAdapter from 'axios-mock-adapter';
import axios, { AxiosInstance } from 'axios';
import { GitlabApiError } from './errors';
import { NewGitlabClient } from './gitlabClient';
import type { HttpTransport } from './httpTransport';

let mock: MockAdapter;
let httpClient: AxiosInstance;

const mockSearchUnavailable = (projectId: string | number) => {
  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/search`).reply(() => [
    403,
    { message: 'Advanced search is not enabled for this GitLab instance.' },
  ]);
};

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {
  });
});

beforeEach(() => {
  httpClient = axios.create();
  mock = new MockAdapter(httpClient);
});

afterEach(() => {
  mock.restore();
});

test('getProject uses injected transport implementation', async () => {
  const transport: HttpTransport = {
    request: jest.fn().mockResolvedValue({
      data: { id: 1, path_with_namespace: 'group/project', default_branch: 'main' },
      headers: {},
      status: 200,
    }),
  };

  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { transport });

  const project = await client.getProject('1');

  expect(project).toEqual({ id: 1, path_with_namespace: 'group/project', default_branch: 'main' });
  expect(transport.request).toHaveBeenCalledWith({
    method: 'get',
    url: 'projects/1',
    headers: expect.objectContaining({
      'PRIVATE-TOKEN': 'MyToken',
      'Content-Type': 'application/json',
    }),
    data: undefined,
    params: undefined,
  });
});

test('getProject makes a GET request and returns data', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';

  // simulate a successful server response
  const projectData = { id: 1, name: 'My Project' };
  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}`).reply(200, projectData);

  const project = await client.getProject(projectId);

  expect(project).toEqual(projectData);
});

test('getAllProjects fetches every page of projects', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });

  const page1Projects = [{ id: 1 }, { id: 2 }];
  const page2Projects = [{ id: 3 }];

  mock.onGet('https://gitlab.example.com/api/v4/projects').replyOnce((config) => {
    expect(config.params).toEqual({ page: 1, per_page: 100 });
    return [200, page1Projects, { 'x-next-page': '2', 'x-total-pages': '2' }];
  });

  mock.onGet('https://gitlab.example.com/api/v4/projects').replyOnce((config) => {
    expect(config.params).toEqual({ page: 2, per_page: 100 });
    return [200, page2Projects, { 'x-next-page': '' }];
  });

  const progressSpy = jest.fn();
  const projects = await client.getAllProjects({ perPage: 100 }, progressSpy);

  expect(projects).toEqual([...page1Projects, ...page2Projects]);
  expect(progressSpy).toHaveBeenNthCalledWith(1, 1, 2);
  expect(progressSpy).toHaveBeenNthCalledWith(2, 2, 2);
});

test('findDependencyFiles stops after reaching maxPages', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '42';
  const branch = 'main';

  mockSearchUnavailable(projectId);

  const repositoryTreePage1 = [{ name: 'go.mod' }];
  const repositoryTreePage2 = [{ name: 'composer.json' }];

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`, {
    params: {
      ref: branch,
      recursive: false,
      page: 1,
      per_page: 100,
    },
  }).reply(200, repositoryTreePage1, { 'x-next-page': '2', 'x-total-pages': '5' });

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`, {
    params: {
      ref: branch,
      recursive: false,
      page: 2,
      per_page: 100,
    },
  }).reply(200, repositoryTreePage2, { 'x-next-page': '3', 'x-total-pages': '5' });

  const files = await client.findDependencyFiles(projectId, branch, { maxPages: 1 });

  expect(files).toEqual(['go.mod']);
  expect(mock.history.get.filter(request => request.url?.endsWith('/repository/tree'))).toHaveLength(1);
});

test('getAllProjects stops iteration when API returns an empty page', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });

  mock.onGet('https://gitlab.example.com/api/v4/projects').replyOnce((config) => {
    expect(config.params).toEqual({ page: 1, per_page: 100 });
    return [200, [], { 'x-next-page': '2' }];
  });

  const progressSpy = jest.fn();
  const projects = await client.getAllProjects({ perPage: 100 }, progressSpy);

  expect(projects).toEqual([]);
  expect(mock.history.get).toHaveLength(1);
  expect(progressSpy).not.toHaveBeenCalled();
});

test('getAllProjects forwards filters and honours page limits', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });

  mock.onGet('https://gitlab.example.com/api/v4/projects').replyOnce(config => {
    expect(config.params).toEqual({
      page: 1,
      per_page: 50,
      search: 'runner',
      membership: true,
      owned: true,
      archived: true,
      simple: true,
      min_access_level: 30,
      order_by: 'updated_at',
      sort: 'desc',
      visibility: 'internal',
    });

    return [200, [{ id: 1 }], { 'x-next-page': '2', 'x-total-pages': '5' }];
  });

  const progressSpy = jest.fn();
  const projects = await client.getAllProjects({
    perPage: 50,
    pageLimit: 1,
    search: 'runner',
    membership: true,
    owned: true,
    archived: true,
    simple: true,
    minAccessLevel: 30,
    orderBy: 'updated_at',
    sort: 'desc',
    visibility: 'internal',
  }, progressSpy);

  expect(projects).toEqual([{ id: 1 }]);
  expect(progressSpy).toHaveBeenCalledWith(1, 5);
  expect(mock.history.get).toHaveLength(1);
});

test('getFileContent makes a GET request and returns data', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });

  // simulate a successful server response
  const fileContent = 'SGVsbG8sIHdvcmxkIQ=='; // Hello, world! encoded in Base64
  const fileData = {
    file_path: 'test.txt',
    encoding: 'base64',
    content: fileContent,
  };

  const projectId = 1;
  const filePath = 'test.txt';
  const branch = 'master';

  const encodedFilePath = encodeURIComponent(filePath);

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/files/${encodedFilePath}`)
    .reply((config) => {
      expect(config.params).toEqual({ ref: branch });
      return [200, fileData];
    });

  const content = await client.getFileContent(projectId, filePath, branch);

  expect(content).toEqual(Buffer.from(fileContent, 'base64').toString('utf8'));
});

test('findDependencyFiles returns an empty array when no dependency files are found', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';
  const branch = 'master';

  mockSearchUnavailable(projectId);

  const repositoryTree = [{ name: 'other-file.txt' }, { name: 'another-file.js' }];

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`)
    .reply(200, repositoryTree);

  const files = await client.findDependencyFiles(projectId, branch);

  expect(files).toEqual([]);
});

test('findDependencyFiles prefers blob search when available', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '77';
  const branch = 'main';
  const searchUrl = `https://gitlab.example.com/api/v4/projects/${projectId}/search`;

  mock.onGet(searchUrl).reply(config => {
    const params = config.params ?? {};
    switch (params.search) {
      case 'filename:go.mod':
        return [200, [{ path: 'go.mod', filename: 'go.mod' }], { 'x-next-page': '0' }];
      case 'filename:package-lock.json':
        return [200, [{ path: 'services/api/package-lock.json', filename: 'package-lock.json' }], { 'x-next-page': '0' }];
      default:
        return [200, [], { 'x-next-page': '0' }];
    }
  });

  const files = await client.findDependencyFiles(projectId, branch);

  expect(files).toEqual(['go.mod']);
  expect(mock.history.get.filter(request => request.url?.endsWith('/repository/tree'))).toHaveLength(0);
});

test('findDependencyFiles returns nested paths via blob search when monorepo is enabled', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '78';
  const branch = 'main';
  const searchUrl = `https://gitlab.example.com/api/v4/projects/${projectId}/search`;

  mock.onGet(searchUrl).reply(config => {
    const params = config.params ?? {};
    switch (params.search) {
      case 'filename:go.mod':
        return [200, [{ path: 'apps/app1/go.mod', filename: 'go.mod' }], { 'x-next-page': '0' }];
      case 'filename:package-lock.json':
        return [200, [{ path: 'apps/app1/package-lock.json', filename: 'package-lock.json' }], { 'x-next-page': '0' }];
      default:
        return [200, [], { 'x-next-page': '0' }];
    }
  });

  const files = await client.findDependencyFiles(projectId, branch, { monorepo: true });

  expect(files).toEqual(['apps/app1/go.mod', 'apps/app1/package-lock.json']);
});

test('findDependencyFiles makes a GET request and returns dependency files', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';
  const branch = 'master';

  mockSearchUnavailable(projectId);

  const repositoryTree = [{ name: 'go.mod' }, { name: 'composer.json' }, { name: 'other-file.txt' }];

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`)
    .reply(200, repositoryTree);

  const files = await client.findDependencyFiles(projectId, branch);

  expect(files).toEqual(['go.mod', 'composer.json']);
});

test('getProjectId makes a GET request and returns data', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const path_with_namespace = 'mygroup/myproject';

  const projectData = { id: 1, name: 'My Project' };
  const encodedPathWithNamespace = encodeURIComponent(path_with_namespace);
  mock.onGet(`https://gitlab.example.com/api/v4/projects/${encodedPathWithNamespace}`).reply(200, projectData);

  const projectId = await client.getProjectId(path_with_namespace);

  expect(projectId).toEqual(projectData.id);
});

test('allowCiJobTokenAccess makes a POST request to the correct endpoint', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const sourceProjectId = '1';
  const targetProjectId = '2';

  mock.onPost(`https://gitlab.example.com/api/v4/projects/${sourceProjectId}/job_token_scope/allowlist`, { target_project_id: targetProjectId })
    .reply(201);

  await client.allowCiJobTokenAccess(sourceProjectId, targetProjectId);
  expect(mock.history.post.length).toBe(1);

  // check if headers are defined before attempting to access properties
  if (mock.history.post[0].headers) {
    const headers = mock.history.post[0].headers;

    expect(headers['PRIVATE-TOKEN']).toEqual('MyToken');
    expect(headers['Content-Type']).toEqual('application/json');
    expect(headers['Accept']).toEqual('application/json, text/plain, */*');
  } else {
    throw new Error('Headers are undefined');
  }
});

test('executeRequest retries retryable errors and exposes GitlabApiError metadata', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', {
    httpClient,
    maxRetries: 1,
    retryDelayMs: 1,
  });

  mock.onGet('https://gitlab.example.com/api/v4/projects/1').replyOnce(503, 'Service Unavailable');
  mock.onGet('https://gitlab.example.com/api/v4/projects/1').replyOnce(503, 'Service Unavailable');

  let thrownError: unknown;
  try {
    await client.getProject('1');
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeDefined();
  expect(thrownError).toBeInstanceOf(GitlabApiError);
  expect(thrownError).toMatchObject({
    statusCode: 503,
    retryable: true,
    endpoint: 'https://gitlab.example.com/api/v4/projects/1',
  });

  expect(mock.history.get).toHaveLength(2);
});

test('isProjectWhitelisted returns true if the project is in the job token scope allowlist', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const sourceProjectId = 1; // Using a project ID that exists in the allowlist
  const depProjectId = 2; // The ID of the other project is arbitrary in this case, since we are mocking the response

  // Simulate a successful server response with the source project included in the allowlist
  const allowList = [{ id: 1, name: 'project1' }, { id: 3, name: 'project3' }];
  mock.onGet(`https://gitlab.example.com/api/v4/projects/${depProjectId}/job_token_scope/allowlist`).reply(200, allowList);

  const isWhitelisted = await client.isProjectWhitelisted(sourceProjectId, depProjectId);

  expect(isWhitelisted).toEqual(true);
});

test('isProjectWhitelisted returns false if the project is not in the job token scope allowlist', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const sourceProjectId = 2; // Using a project ID that does not exist in the allowlist
  const depProjectId = 3; // The ID of the other project is arbitrary in this case, since we are mocking the response

  // Simulate a successful server response with the source project included in the allowlist
  const allowList = [{ id: 1, name: 'project1' }, { id: 3, name: 'project3' }];
  mock.onGet(`https://gitlab.example.com/api/v4/projects/${depProjectId}/job_token_scope/allowlist`).reply(200, allowList);

  const isWhitelisted = await client.isProjectWhitelisted(sourceProjectId, depProjectId);

  expect(isWhitelisted).toEqual(false);
});

test('getProject logs error and rethrows on failure', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}`).reply(500);

  await expect(client.getProject(projectId)).rejects.toThrow();
});

test('isProjectWhitelisted logs error and rethrows on failure', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const sourceProjectId = 1;
  const depProjectId = 2;

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${depProjectId}/job_token_scope/allowlist`).reply(500);

  await expect(client.isProjectWhitelisted(sourceProjectId, depProjectId)).rejects.toThrow();
});

test('getFileContent throws error on unexpected encoding', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = 1;
  const filePath = 'test.txt';
  const branch = 'master';

  const fileData = {
    file_path: 'test.txt',
    encoding: 'utf8',
    content: 'Hello, world!',
  };

  const encodedFilePath = encodeURIComponent(filePath);

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/files/${encodedFilePath}`)
    .reply(200, fileData);

  await expect(client.getFileContent(projectId, filePath, branch)).rejects.toThrow('Unexpected encoding of file content received from GitLab API');
});

test('findDependencyFiles makes a GET request and returns dependency files across paginated responses', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';
  const branch = 'master';

  mockSearchUnavailable(projectId);

  const repositoryTreePage1 = [{ name: 'go.mod' }, { name: 'file1.txt' }];
  const repositoryTreePage2 = [{ name: 'composer.json' }, { name: 'file2.txt' }];

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`, {
    params: {
      ref: branch,
      recursive: false,
      page: 1,
      per_page: 20,
    },
  }).reply(200, repositoryTreePage1, { 'x-next-page': '2', 'x-total-pages': '2' });

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`, {
    params: {
      ref: branch,
      recursive: false,
      page: 2,
      per_page: 20,
    },
  }).reply(200, repositoryTreePage2, { 'x-next-page': '' });

  const progressSpy = jest.fn();
  const files = await client.findDependencyFiles(projectId, branch, {
    monorepo: false,
    pageSize: 20,
    onProgress: progressSpy,
  });

  expect(files).toEqual(['go.mod', 'composer.json']);
  expect(progressSpy).toHaveBeenNthCalledWith(1, 1, 2);
  expect(progressSpy).toHaveBeenNthCalledWith(2, 2, 2);
});

test('findDependencyFiles returns paths when monorepo flag is true', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  const projectId = '1';
  const branch = 'master';

  mockSearchUnavailable(projectId);

  const monorepoTree = [{ path: 'apps/app1/go.mod' }, { path: 'apps/app1/package-lock.json' }, { path: 'README.md' }];

  mock.onGet(`https://gitlab.example.com/api/v4/projects/${projectId}/repository/tree`, {
    params: {
      ref: branch,
      recursive: true,
      page: 1,
      per_page: 100,
    },
  }).reply(200, monorepoTree, { 'x-next-page': '0' });

  const files = await client.findDependencyFiles(projectId, branch, { monorepo: true });

  expect(files).toEqual(['apps/app1/go.mod', 'apps/app1/package-lock.json']);
});

test('gitlab client should return the correct url', async () => {
  const client = NewGitlabClient('https://gitlab.example.com', 'MyToken', { httpClient });
  expect(client.Url).toEqual('https://gitlab.example.com');
});
