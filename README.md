Auto-update is a minimalist [JavaScript GitHub action](https://help.github.com/en/articles/about-actions#javascript-actions) to keep pull requests with [auto-merge](https://docs.github.com/en/free-pro-team@latest/github/collaborating-with-issues-and-pull-requests/automatically-merging-a-pull-request) enabled [up to date with their base branch](https://developer.github.com/changes/2019-05-29-update-branch-api/).

It is the missing piece to really automatically merge pull requests when [strict status checks](https://help.github.com/en/articles/types-of-required-status-checks) are set up to protect against [semantic conflicts](https://bors.tech/essay/2017/02/02/pitch/).

Add [.github/workflows/auto-update.yml](.github/workflows/auto-update.yml) to your repository to use this action.


#### Triggering CI checks

Due to Github Action limitations, the CI checks are not triggered when the action is run. To trigger the CI checks, you can use the following code in your workflow file:

```yaml
jobs:
  auto-update-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: tibdex/auto-update@v2
        with:
          github_token: ${{ secrets.YOUR_TOKEN }}
          workflow_id: 'YOUR_WORKFLOW_ID'
```
YOUR_TOKEN must have sufficient permissions to trigger the workflow.
YOUR_WORKFLOW_ID is either the name of the workflow file or the id of the workflow.

Then, make sure you update your workflow file to subscribe to the worfklow_dispatch event.