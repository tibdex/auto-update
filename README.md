Auto-update is a minimalist [JavaScript GitHub action](https://help.github.com/en/articles/about-actions#javascript-actions) to keep pull requests with [auto-merge](https://docs.github.com/en/free-pro-team@latest/github/collaborating-with-issues-and-pull-requests/automatically-merging-a-pull-request) enabled [up to date with their base branch](https://developer.github.com/changes/2019-05-29-update-branch-api/).

It is the missing piece to really automatically merge pull requests when [strict status checks](https://help.github.com/en/articles/types-of-required-status-checks) are set up to protect against [semantic conflicts](https://bors.tech/essay/2017/02/02/pitch/).

Add [.github/workflows/auto-update.yml](.github/workflows/auto-update.yml) to your repository to use this action.

## Triggering workflows after branch auto-update
If CI checks are supposed to run on branch update (which is most likely the reason why you use this GH action), you may need some additional setup.

When your branch is auto-updated while using the `GITHUB_TOKEN`, workflows depending on PR events will not run. See https://github.com/orgs/community/discussions/26520

To work around this issue you can either:
- Use a github token that has permissions to trigger workflows, like a [Github App token](https://github.com/tibdex/github-app-token#github-app-token) or a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- Edit your auto-update workflow to fire a workflow_dispatch event (and edit your CI check workflow to react to that dispatch event)
