const core = require("@actions/core");
const { getOctokit, context } = require("@actions/github");

const token = core.getInput("token");
const runId = core.getInput("run-id");

const { 
  rest: { 
    actions: { getWorkflowRun }, 
    issues: { listComments, deleteComment, createComment },
    pulls: { get: getPull }
  } 
} = getOctokit(token);


const { owner, repo } = context.repo;

async function main() {
  const { data: runData } = await getWorkflowRun({ 
    owner,
    repo,
    run_id: runId,
  });

  // Only run this if the workflow ran successfully
  if (runData.status !== 'completed' && runData.conclusion !== 'success') {
    return;
  }

  // Not sure why this would happen... but, pull_requests is an array, so we should account for the possibility
  if (runData.pullRequests.length !== 1) {
    throw new Error(`Workflow run ID ${runId} associated with ${runData.pullRequests.length} PRs. Expected only 1.`);
  }

  const prNumber = runData.pullRequests[0].number;

  const { data: { user: { login: prCreatorUsername, type: prCreatorType } } } = await getPull({
    owner,
    repo,
    pull_number: prNumber
  });

  // We only care about dependabot PRs
  const userIsDependabot = prCreatorUsername.match(/^dependabot/) && prCreatorType === 'Bot';

  if (!userIsDependabot) {
    return;
  }

  const { data: comments } = await listComments({
    owner,
    repo, 
    issue_number: prNumber
  });

  for (const comment of comments) {
    if (comment.body === '@dependabot merge') {
      await deleteComment({
        owner,
        repo,
        comment_id: comment.id
      })
    }
  }

  await createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: '@dependabot merge'
  });
}

main().catch((e) => {
  core.error(e);
  core.setFailed(e.message);
})