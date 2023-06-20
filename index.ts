import * as core from "@actions/core";
import * as github from "@actions/github";

const token = core.getInput("token", { required: true });
const octokit = github.getOctokit(token);
const eventPayload = github.context.payload;
const event_name = github.context.eventName;

const owner: any = eventPayload.repository?.owner.login;
const repo: any = eventPayload.repository?.name;
const sender = eventPayload.sender?.login;
const ref = eventPayload.ref;
const ref_type = eventPayload.ref_type;

const regex = core.getInput("regex");
const flags = core.getInput("flags") || "i";
const re = new RegExp(regex, flags);

const delete_issue = core.getInput("delete") || "";

(async () => {
  try {
    if (
      event_name === "create" &&
      ref_type === "branch" &&
      re.test(ref) === false
    ) {
      await octokit.rest.issues.create({
        owner: owner,
        repo: repo,
        title: `:no_good: Branch \`${ref}\` has an incorrect name`,
        body: `:wave: @${sender} <br><br>Please update the branch name \`${ref}\` to the approved regex naming convention format below.<br><br>\`Regex: ${regex}\`<br>\`Flags: ${flags}\``,
        assignee: sender,
      });
    }
    if (
      eventPayload.pull_request &&
      re.test(eventPayload.pull_request.head.ref) === false
    ) {
      core.setFailed(
        `The head branch of pull request ${eventPayload.pull_request.number} has an incorrent name. Please update the branch name to the approved regex naming convention format. Regex: ${regex} Flags: ${flags}`
      );
      await octokit.rest.issues.addLabels({
        issue_number: eventPayload.pull_request.number,
        owner: owner,
        repo: repo,
        labels: ["Invalid Branch Name"],
      });
    }
    if (
      eventPayload.pull_request &&
      re.test(eventPayload.pull_request.head.ref) === true
    ) {
      await octokit.rest.issues.addLabels({
        issue_number: eventPayload.pull_request.number,
        owner: owner,
        repo: repo,
        labels: ["Valid Branch Name"],
      });
    }
    if (
      event_name === "delete" &&
      ref_type === "branch" &&
      re.test(ref) === false
    ) {
      try {
        let endCursor = null;
        const query = /* GraphQL */ `
          query ($org: String!, $repo: String!, $cursorID: String) {
            repository(owner: $org, name: $repo) {
              issues(first: 100, after: $cursorID) {
                nodes {
                  title
                  id
                }
                pageInfo {
                  endCursor
                  hasNextPage
                }
              }
            }
          }
        `;
        let hasNextPage = false;
        let dataJSON;

        do {
          dataJSON = await octokit.graphql({
            query,
            org: owner,
            repo: repo,
            cursorID: endCursor,
          });

          const issues = dataJSON.repository.issues.nodes;

          hasNextPage = dataJSON.repository.issues.pageInfo.hasNextPage;

          for (const issue of issues) {
            if (hasNextPage) {
              endCursor = dataJSON.repository.issues.pageInfo.endCursor;
            } else {
              endCursor = null;
            }

            if (
              issue.title ===
              `:no_good: Branch \`${ref}\` has an incorrect name`
            ) {
              if (delete_issue === "true") {
                try {
                  const query = /* GraphQL */ `
                    mutation ($issueId: ID!) {
                      deleteIssue(input: { issueId: $issueId }) {
                        clientMutationId
                      }
                    }
                  `;
                  dataJSON = await octokit.graphql({
                    query,
                    issueId: issue.id,
                  });
                } catch (error) {
                  if (error instanceof Error)
                    core.setFailed(`${error.message}`);
                }
              } else {
                try {
                  const query = /* GraphQL */ `
                    mutation ($issueId: ID!) {
                      closeIssue(input: { issueId: $issueId }) {
                        clientMutationId
                      }
                    }
                  `;
                  dataJSON = await octokit.graphql({
                    query,
                    issueId: issue.id,
                  });
                } catch (error) {
                  if (error instanceof Error)
                    core.setFailed(`${error.message}`);
                }
              }
            }
          }
        } while (hasNextPage);
      } catch (error) {
        if (error instanceof Error) core.setFailed(`${error.message}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(`${error.message}`);
  }
})();
