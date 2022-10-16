import { getInput, group, info, setFailed, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils.js";
import type { PaginatingEndpoints } from "@octokit/plugin-paginate-rest";
import type { PushEvent } from "@octokit/webhooks-definitions/schema.js";
import ensureError from "ensure-error";

const unupdatablePullRequestCommentBody =
  "Cannot auto-update because of conflicts.";

type PullRequest =
  PaginatingEndpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];

const handleUnupdatablePullRequest = async (
  pullRequest: PullRequest,
  {
    octokit,
  }: Readonly<{
    octokit: InstanceType<typeof GitHub>;
  }>,
): Promise<void> => {
  try {
    const {
      head: {
        repo: { full_name },
        sha,
      },
      number,
    } = pullRequest;

    const [owner, repo] = full_name.split("/");

    const {
      data: { commit: lastCommit },
    } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
      owner,
      ref: sha,
      repo,
    });

    const lastCommitter = lastCommit.committer;

    if (!lastCommitter) {
      throw new Error(`Missing committer on last commit ${sha}`);
    }

    const comments = await octokit.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        ...context.repo,
        issue_number: number,
        since: lastCommitter.date,
      },
    );

    const existingUnupdatablePullRequestComment = comments.find(
      ({ body }) => body === unupdatablePullRequestCommentBody,
    );

    if (existingUnupdatablePullRequestComment) {
      info(
        `Already commented since last commit: ${existingUnupdatablePullRequestComment.html_url}`,
      );
      return;
    }

    const { data: newComment } = await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        ...context.repo,
        body: unupdatablePullRequestCommentBody,
        issue_number: number,
      },
    );

    info(`Commented: ${newComment.html_url}`);
  } catch (error: unknown) {
    warning(ensureError(error));
  }
};

const handlePullRequest = async (
  pullRequest: PullRequest,
  {
    eventPayload,
    octokit,
  }: Readonly<{
    eventPayload: PushEvent;
    octokit: InstanceType<typeof GitHub>;
  }>,
): Promise<void> => {
  if (!pullRequest.auto_merge) {
    info(
      `Pull request #${pullRequest.number} does not have auto-merge enabled`,
    );
    return;
  }

  if (pullRequest.base.sha === eventPayload.after) {
    info(`Pull request #${pullRequest.number} is already up to date`);
    return;
  }

  await group(
    `Attempting to update pull request #${pullRequest.number}`,
    async () => {
      try {
        await octokit.request(
          "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
          {
            ...context.repo,
            pull_number: pullRequest.number,
          },
        );
        info("Updated!");
      } catch (error: unknown) {
        warning(ensureError(error));
        await handleUnupdatablePullRequest(pullRequest, { octokit });
      }
    },
  );
};

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    const octokit = getOctokit(token);

    if (context.eventName !== "push") {
      throw new Error(
        `Expected to be triggered by a "push" event but received a "${context.eventName}" event`,
      );
    }

    const eventPayload = context.payload as PushEvent;
    // See https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#webhook-payload-object-34.
    const base = eventPayload.ref.slice("refs/heads/".length);

    info(`Fetching pull requests based on "${base}"`);

    const pullRequests: readonly PullRequest[] = await octokit.paginate(
      "GET /repos/{owner}/{repo}/pulls",
      {
        ...context.repo,
        base,
        state: "open",
      },
    );

    info(
      `Fetched pull requests: ${JSON.stringify(
        pullRequests.map((pullRequest) => pullRequest.number),
      )}`,
    );

    for (const pullRequest of pullRequests) {
      // PRs are handled sequentially to avoid breaking GitHub's log grouping feature.
      // eslint-disable-next-line no-await-in-loop
      await handlePullRequest(pullRequest, { eventPayload, octokit });
    }
  } catch (error: unknown) {
    setFailed(ensureError(error));
  }
};

void run();
