export interface GitlabProject {
  id: number;
  path_with_namespace: string;
  default_branch: string;
  name?: string;
  [key: string]: unknown;
}

export interface GitlabJobTokenAllowlistEntry {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export interface GitlabRepositoryTreeItem {
  id?: string | number;
  name?: string;
  path?: string;
  type?: string;
  [key: string]: unknown;
}

export interface GitlabRepositoryFile {
  file_path: string;
  encoding: string;
  content: string;
  [key: string]: unknown;
}
