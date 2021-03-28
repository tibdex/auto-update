import {
  error as logError,
  getInput,
  info,
  group,
  setFailed,
  warning,
} from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import type { components } from "@octokit/openapi-types";
import type { PushEvent } from "@octokit/webhooks-definitions/schema";

const handleError = (
  error: unknown,
  {
    handle = logError,
  }: Readonly<{ handle?: (error: string | Error) => void }> = {},
) => {
  if (typeof error !== "string" && !(error instanceof Error)) {
    throw new TypeError(`Caught error of unexpected type: ${typeof error}`);
  }

  handle(error);
};

const handlePullRequest = async (
  pullRequest: components["schemas"]["pull-request-simple"],
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

  const { data: detailedPullRequest } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      ...context.repo,
      pull_number: pullRequest.number,
    },
  );

  if (!detailedPullRequest.mergeable) {
    info(
      `Pull request #${pullRequest.number} is not mergeable (it probably has conflicts)`,
    );
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
            // See https://docs.github.com/en/free-pro-team@latest/rest/reference/pulls#update-a-pull-request-branch-preview-notices.
            mediaType: {
              previews: ["lydian"],
            },
            pull_number: pullRequest.number,
          },
        );
        info("Updated!");
      } catch (error: unknown) {
        handleError(error, { handle: warning });
      }
    },
  );
};

const run = async () => {
  try {
    const label = getInput("label") || undefined;
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

    const pullRequests = await octokit.paginate(
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
      await handlePullRequest(pullRequest, { eventPayload, octokit });
    }
  } catch (error: unknown) {
    handleError(error, { handle: setFailed });
  }
};

void run();
