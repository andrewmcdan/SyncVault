import { getOctokit } from "./github-client";

export interface GitHubRepoInfo {
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
}

export interface GitHubRepoListItem {
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
}

export async function getAuthenticatedOwner(token: string): Promise<string> {
  const octokit = getOctokit(token);
  const { data } = await octokit.request("GET /user");
  return data.login;
}

export async function listSyncVaultRepos(token: string): Promise<GitHubRepoListItem[]> {
  const octokit = getOctokit(token);
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated"
  });

  return repos
    .filter((repo) => repo.name.startsWith("syncvault-"))
    .map((repo) => ({
      owner: repo.owner?.login ?? "",
      name: repo.name,
      cloneUrl: repo.clone_url,
      htmlUrl: repo.html_url
    }));
}

export async function createPrivateRepo(
  token: string,
  repoName: string
): Promise<GitHubRepoInfo> {
  const octokit = getOctokit(token);
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
      auto_init: true,
      description: "SyncVault templates and metadata"
    });

    return {
      owner: data.owner?.login ?? "",
      name: data.name,
      cloneUrl: data.clone_url,
      htmlUrl: data.html_url
    };
  } catch (error: any) {
    if (error?.status === 422) {
      const owner = await getAuthenticatedOwner(token);
      const { data } = await octokit.repos.get({ owner, repo: repoName });
      return {
        owner: data.owner?.login ?? owner,
        name: data.name,
        cloneUrl: data.clone_url,
        htmlUrl: data.html_url
      };
    }
    throw error;
  }
}

export async function deleteRepo(token: string, owner: string, repo: string): Promise<void> {
  const octokit = getOctokit(token);
  await octokit.repos.delete({ owner, repo });
}
