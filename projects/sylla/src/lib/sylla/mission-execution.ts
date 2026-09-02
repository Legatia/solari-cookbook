import { createSolariAdapters } from "@/lib/solari";
import {
  EntitlementRequiredError,
  OPERATION_CREDITS,
  releaseBillableOperation,
  reserveBillableOperation,
  settleBillableOperation,
} from "@/lib/sylla/billing";
import {
  prepareBrowserResearch,
  researchNextBrowserSource,
} from "@/lib/sylla/browser-research";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  evaluatePairDirection,
  getCandidatePairForParticipant,
  getCandidateShortlist,
  reserveCandidatePair,
} from "@/lib/sylla/matching";
import {
  claimMission,
  completeMission,
  failMission,
  getMission,
  markMissionStep,
  type MissionView,
} from "@/lib/sylla/missions";
import { openParticipantWorkspace } from "@/lib/sylla/workspace";
import { requireParticipationCapability } from "@/lib/sylla/participation";

function authorization(
  clientId: string,
  runId: string,
  leaseToken: string,
): RuntimeLeaseAuthorization {
  return { clientId, runId, leaseToken };
}

async function executeBrowserMission(
  participantId: string,
  mission: MissionView,
  lease: RuntimeLeaseAuthorization,
) {
  const accountOperation = mission.capability === "operate_web_account";
  const estimatedCredits =
    mission.constraints.sourceUrls.length * OPERATION_CREDITS.browser_source;
  if (estimatedCredits > mission.constraints.maxCredits) {
    throw new Error(
      `This mission permits ${mission.constraints.maxCredits} credits but its approved Browser scope needs approximately ${estimatedCredits}.`,
    );
  }
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 1,
    status: accountOperation ? "active" : "completed",
    output: accountOperation
      ? undefined
      : { approvedSourceCount: mission.constraints.sourceUrls.length },
  });
  if (!accountOperation) {
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 2,
      status: "active",
    });
  }
  let progress = await prepareBrowserResearch({
    participantId,
    authorization: lease,
    idempotencyKey: `mission:${mission.id}:research`,
    focus: mission.objective,
    sources: mission.constraints.sourceUrls,
    backgroundContinuationAllowed:
      mission.constraints.backgroundContinuationAllowed,
    fallbackBudgetCredits: mission.constraints.backgroundContinuationAllowed
      ? mission.constraints.sourceUrls.length
      : 0,
    profileMode: "preserve",
  });
  for (
    let index = 0;
    index < mission.constraints.sourceUrls.length &&
    progress.nextSourceId &&
    progress.run.status === "host_orchestrated";
    index += 1
  ) {
    progress = await researchNextBrowserSource({
      participantId,
      agentRunId: progress.run.id,
      authorization: lease,
      idempotencyKey: `mission:${mission.id}:source:${index + 1}`,
    });
  }
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: accountOperation ? 1 : 2,
    status: "completed",
    output: {
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
      sources: progress.sources.map((source) => ({
        id: source.id,
        url: source.url,
        title: source.title,
        excerpt: source.excerpt,
        status: source.status,
      })),
    },
    providerReference: progress.run.id,
  });
  if (accountOperation) {
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 2,
      status: "completed",
      output: {
        preparedOnly: true,
        externalActionPerformed: false,
        reason:
          "Sylla inspected the approved source but the persistent authenticated-browser action runner is not enabled yet.",
      },
    });
    return completeMission({
      participantId,
      missionId: mission.id,
      result: {
        capability: mission.capability,
        preparedOnly: true,
        externalActionPerformed: false,
        sources: progress.sources,
        nextApproval:
          "The final authenticated action remains blocked until Sylla's persistent Browser profile runner is enabled.",
      },
      waitingForUser: true,
    });
  }
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 3,
    status: "completed",
    output: { synthesisReadyFor: "connected_host", evidencePreserved: true },
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 4,
    status: "completed",
    output: { memoryApprovalRequired: true },
  });
  return completeMission({
    participantId,
    missionId: mission.id,
    result: {
      capability: mission.capability,
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
      sources: progress.sources,
      memoryPolicy:
        "Evidence-derived memories remain proposals until the participant reviews them.",
    },
  });
}

async function executeRepositoryMission(
  participantId: string,
  mission: MissionView,
) {
  await requireParticipationCapability(participantId, "publicSourceResearch");
  if (mission.constraints.maxCredits < OPERATION_CREDITS.sandbox_task) {
    throw new Error(
      `This mission permits ${mission.constraints.maxCredits} credits but an isolated repository check needs approximately ${OPERATION_CREDITS.sandbox_task}.`,
    );
  }
  const repository = mission.constraints.sourceUrls[0];
  if (!repository) throw new Error("A public repository URL is required.");
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 1,
    status: "completed",
    output: { repositoryUrl: repository.url, publicCredentialUsed: false },
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 2,
    status: "active",
  });
  const reservation = await reserveBillableOperation({
    participantId,
    operation: "sandbox_task",
    idempotencyKey: `mission:${mission.id}:sandbox-task`,
  });
  if (reservation.alreadyProcessed) {
    throw new Error("This repository mission already consumed its isolated execution.");
  }
  try {
    const adapters = await createSolariAdapters();
    const task = await adapters.sandboxTask.runRepositoryTask({
      participantRef: participantId,
      repositoryUrl: repository.url,
      objective: mission.objective,
    });
    await settleBillableOperation(reservation, task.runReference);
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 2,
      status: "completed",
      output: {
        projectType: task.projectType,
        repositoryUrl: task.repositoryUrl,
      },
      providerReference: task.runReference,
    });
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 3,
      status: "completed",
      output: {
        command: task.command,
        exitCode: task.exitCode,
        stdout: task.stdout,
        stderr: task.stderr,
      },
    });
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 4,
      status: "completed",
      output: { summary: task.summary },
    });
    return completeMission({
      participantId,
      missionId: mission.id,
      result: {
        capability: mission.capability,
        provider: task.provider,
        repositoryUrl: task.repositoryUrl,
        projectType: task.projectType,
        command: task.command,
        exitCode: task.exitCode,
        stdout: task.stdout,
        stderr: task.stderr,
        summary: task.summary,
      },
    });
  } catch (error) {
    await releaseBillableOperation(reservation);
    throw error;
  }
}

async function executeWorkspaceMission(
  participantId: string,
  mission: MissionView,
  lease: RuntimeLeaseAuthorization,
) {
  const minimumCredits = OPERATION_CREDITS.workspace_open;
  if (mission.constraints.maxCredits < minimumCredits) {
    throw new Error(
      `This mission permits ${mission.constraints.maxCredits} credits but opening a new workspace may need ${minimumCredits}.`,
    );
  }
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 1,
    status: "completed",
    output: { approvedContextOnly: true },
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 2,
    status: "active",
  });
  const opened = await openParticipantWorkspace(participantId, {
    authorization: lease,
    idempotencyKey: `mission:${mission.id}:workspace-open`,
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 2,
    status: "completed",
    output: {
      status: opened.state.workspace?.status ?? "unprovisioned",
      durableVolume: Boolean(opened.state.workspace?.volumeId),
    },
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 3,
    status: "completed",
    output: { snapshotId: opened.state.workspace?.snapshotId ?? null },
  });
  return completeMission({
    participantId,
    missionId: mission.id,
    result: {
      capability: mission.capability,
      workspaceStatus: opened.state.workspace?.status ?? "unprovisioned",
      hasDurableVolume: Boolean(opened.state.workspace?.volumeId),
      hasRecoverySnapshot: Boolean(opened.state.workspace?.snapshotId),
    },
  });
}

async function executeIntroductionMission(
  participantId: string,
  mission: MissionView,
) {
  if (mission.constraints.maxCredits < OPERATION_CREDITS.sandbox_evaluation) {
    throw new Error(
      `This mission permits ${mission.constraints.maxCredits} credits but one private evaluation needs approximately ${OPERATION_CREDITS.sandbox_evaluation}.`,
    );
  }
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 1,
    status: "active",
  });
  const shortlist = await getCandidateShortlist(participantId, 1);
  const candidate = shortlist.candidates[0];
  if (!candidate) {
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 1,
      status: "completed",
      output: { eligibleCandidateFound: false },
    });
    await markMissionStep({
      participantId,
      missionId: mission.id,
      sequence: 2,
      status: "skipped",
    });
    return completeMission({
      participantId,
      missionId: mission.id,
      result: {
        status: "no_candidate_yet",
        privacy: "No eligibility threshold was lowered.",
      },
      waitingForUser: true,
    });
  }
  const pair = await reserveCandidatePair({
    subjectParticipantId: participantId,
    candidateParticipantId: candidate.participantId,
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 1,
    status: "completed",
    output: { eligibleCandidateFound: true, identityDisclosed: false },
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 2,
    status: "active",
  });
  const evaluation = await evaluatePairDirection({
    candidatePairId: pair.id,
    subjectParticipantId: participantId,
    idempotencyKey: `mission:${mission.id}:introduction-direction`,
    orchestrator: "host_requested_sandbox",
  });
  await markMissionStep({
    participantId,
    missionId: mission.id,
    sequence: 2,
    status: "completed",
    output: { status: evaluation.status, identityDisclosed: false },
    providerReference: evaluation.provider ?? undefined,
  });
  const privatePair = await getCandidatePairForParticipant(participantId, pair.id);
  return completeMission({
    participantId,
    missionId: mission.id,
    result: {
      status: "waiting_for_other_agent",
      candidatePair: privatePair,
      privacy:
        "No identity, private rationale, or other participant decision is disclosed before bilateral consent completes.",
    },
    waitingForUser: true,
  });
}

export async function continueMission(input: {
  participantId: string;
  clientId: string;
  missionId: string;
}) {
  const existing = await getMission(input.participantId, input.missionId);
  if (existing.status !== "ready") return existing;
  const runId = `mission-${existing.id}`;
  const acquired = await acquireRuntimeLease({
    participantId: input.participantId,
    clientId: input.clientId,
    runId,
    purpose: existing.objective,
    durationSeconds: 300,
  });
  const lease = authorization(input.clientId, runId, acquired.leaseToken);
  let claimed = existing;

  try {
    claimed = await claimMission(input.participantId, input.missionId);
    if (claimed.status !== "active") return claimed;
    if (claimed.capability === "test_software") {
      return await executeRepositoryMission(input.participantId, claimed);
    }
    if (claimed.capability === "maintain_personal_workspace") {
      return await executeWorkspaceMission(input.participantId, claimed, lease);
    }
    if (claimed.capability === "find_private_introduction") {
      return await executeIntroductionMission(input.participantId, claimed);
    }
    if (claimed.capability === "operate_web_account") {
      const researched = await executeBrowserMission(
        input.participantId,
        claimed,
        lease,
      );
      return researched;
    }
    return await executeBrowserMission(input.participantId, claimed, lease);
  } catch (error) {
    await failMission({
      participantId: input.participantId,
      missionId: claimed.id,
      error: error instanceof Error ? error.message : "Mission execution failed.",
    }).catch(() => undefined);
    if (error instanceof EntitlementRequiredError) throw error;
    return getMission(input.participantId, claimed.id);
  } finally {
    await releaseRuntimeLease(input.participantId, lease).catch(() => undefined);
  }
}
