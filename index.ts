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
const re = new RegExp(regex);

const app_name = core.getInput("app-name") || "";
const app_name_list = core.getInput("app-name-list") || "";
const app = core.getInput("app") || false;

(async () => {
  try {
    let namePattern = "";
    let flag = true;
    if (app_name_list != "") {
      let app_list = app_name_list.split(",");
      if (app_list.includes(app_name)) {
        namePattern = app_name + "/";
      } else {
        flag = false;
      }
    } else {
      if (app_name != "") {
        namePattern = "{app-name}/";
      }
    }

    if (event_name === "create" && ref_type == "branch") {
      if (flag) {
        if (re.test(ref) === false) {
          core.setFailed(
            `Branch \`${ref}\` has an incorrect name. Please update the branch name to the approved branch name format: \`${namePattern}{wording}/branch-name\`. Wording: feature, hotfix, bugfix`
          );
          await octokit.rest.issues.create({
            owner: owner,
            repo: repo,
            title: `:no_good: Branch \`${ref}\` has an incorrect name`,
            body: `:wave: @${sender} <br><br>Please update the branch name \`${ref}\` to the approved branch name format: \`${namePattern}{wording}/branch-name\`.<br><br>\`Wording: feature, hotfix, bugfix\``,
            assignee: sender,
          });
        }
      } else {
        core.setFailed(
          `The app name is not exist. Please refer to the application name list in APPOWNERS`
        );
        await octokit.rest.issues.create({
          owner: owner,
          repo: repo,
          title: `:no_good: App name of Branch \`${ref}\` is not exist`,
          body: `:wave: @${sender} <br><br>Please refer to the application name list in APPOWNERS`,
          assignee: sender,
        });
      }
    }

    if (eventPayload.pull_request) {
      if (flag) {
        if (re.test(eventPayload.pull_request.head.ref) === true) {
          await octokit.rest.issues.addLabels({
            issue_number: eventPayload.pull_request.number,
            owner: owner,
            repo: repo,
            labels: ["Valid Branch Name Format"],
          });
        } else {
          core.setFailed(
            `The head branch of pull request ${eventPayload.pull_request.number} has an incorrect name. Please update the branch name to the approved branch name format: \`${namePattern}{wording}/branch-name\`. Wording: feature, hotfix, bugfix`
          );
          await octokit.rest.issues.addLabels({
            issue_number: eventPayload.pull_request.number,
            owner: owner,
            repo: repo,
            labels: ["Invalid Branch Name Format"],
          });
        }
      } else {
        core.setFailed(
          `The app name is not exist. Please refer to the application name list in APPOWNERS`
        );
        await octokit.rest.issues.addLabels({
          issue_number: eventPayload.pull_request.number,
          owner: owner,
          repo: repo,
          labels: ["App Name Not Exist"],
        });
      }
    }

    if (event_name === "delete" && ref_type === "branch") {
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
                `:no_good: Branch \`${ref}\` has an incorrect name` ||
              issue.title ===
                `:no_good: App name of Branch \`${ref}\` is not exist`
            ) {
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
                if (error instanceof Error) core.setFailed(`${error.message}`);
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
