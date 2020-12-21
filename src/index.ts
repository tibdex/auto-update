import {
  error as logError,
  getInput,
  info,
  group,
  setFailed,
  warning,
} from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { EventPayloads } from "@octokit/webhooks";

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

    const payload = context.payload as EventPayloads.WebhookPayloadPush;
    // See https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/webhook-events-and-payloads#webhook-payload-object-34.
    const base = payload.ref.slice("/refs/heads/".length);

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

    await Promise.all(
      pullRequests
        .filter((pullRequest) => {
          if (
            label !== undefined &&
            !pullRequest.labels.some(({ name }) => name === label)
          ) {
            info(
              `Pull request #${pullRequest.number} does not have the "${label}" label`,
            );
            return false;
          }

          if (pullRequest.draft) {
            info(`Pull request #${pullRequest.number} is still a draft`);
            return false;
          }

          if (pullRequest.base.sha === payload.after) {
            info(`Pull request #${pullRequest.number} is already up to date`);
            return false;
          }

          return true;
        })
        .map(async (pullRequest) => {
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
        }),
    );
  } catch (error: unknown) {
    handleError(error, { handle: setFailed });
  }
};

void run();
