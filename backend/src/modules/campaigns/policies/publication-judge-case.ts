export type PublicationJudgeCaseStatus = "OPEN" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface PublicationJudgeVote {
  judge: string;
  approved: boolean;
}

export interface PublicationJudgeCase {
  caseId: string;
  creator: string;
  commitmentHash: string;
  termsHash: string;
  voteDeadline: string;
  selectionSeed: string;
  status: PublicationJudgeCaseStatus;
  judges: string[];
  votes: PublicationJudgeVote[];
  approveVotes: number;
  rejectVotes: number;
  decisionHash: string | null;
}

export interface PublicationJudgeEvent {
  eventName: string;
  args: Record<string, unknown>;
  canonical?: boolean;
  transactionHash?: string | null;
  logIndex?: number | string | bigint | null;
  blockNumber?: number | string | bigint | null;
  blockHash?: string | null;
}

const JUDGE_COUNT = 3;

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : -1;
}

function eventOrder(event: PublicationJudgeEvent, index: number) {
  const block = asNumber(event.blockNumber);
  const log = asNumber(event.logIndex);
  return [block < 0 ? Number.MAX_SAFE_INTEGER : block, log < 0 ? Number.MAX_SAFE_INTEGER : log, index];
}

function eventIdentity(event: PublicationJudgeEvent) {
  if (event.transactionHash && event.logIndex != null && event.blockHash) {
    return `${event.transactionHash}:${String(event.logIndex)}:${event.blockHash}`;
  }
  return `${event.eventName}:${JSON.stringify(event.args, (_, value) => typeof value === "bigint" ? value.toString() : value)}`;
}

function resolvedStatus(value: unknown): PublicationJudgeCaseStatus | null {
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (normalized === "APPROVED" || normalized === "REJECTED" || normalized === "EXPIRED") return normalized;
  }
  return ({ 1: "APPROVED", 2: "REJECTED", 3: "EXPIRED" } as const)[asNumber(value) as 1 | 2 | 3] ?? null;
}

/** Reduce canonical Judge events. Database rows never create publication authority. */
export function derivePublicationJudgeCase(
  events: readonly PublicationJudgeEvent[],
  commitmentHash: string,
): PublicationJudgeCase | null {
  const unique = new Map<string, { event: PublicationJudgeEvent; index: number }>();
  events.forEach((event, index) => {
    if (event.canonical === false) return;
    const identity = eventIdentity(event);
    if (!unique.has(identity)) unique.set(identity, { event, index });
  });
  const ordered = [...unique.values()].sort((left, right) => {
    const a = eventOrder(left.event, left.index);
    const b = eventOrder(right.event, right.index);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  }).map(item => item.event);
  const created = ordered.find(event => event.eventName === "JudgeCaseCreated"
    && asString(event.args.commitmentHash).toLowerCase() === commitmentHash.toLowerCase());
  if (!created) return null;

  const caseId = asString(created.args.caseId);
  const selected = new Map<number, string>();
  const votes = new Map<string, PublicationJudgeVote>();
  let status: PublicationJudgeCaseStatus = "OPEN";
  let approveVotes = 0;
  let rejectVotes = 0;
  let decisionHash: string | null = null;

  for (const event of ordered) {
    if (asString(event.args.caseId) !== caseId) continue;
    if (event.eventName === "JudgeSelected") {
      const seat = asNumber(event.args.seat);
      const judge = asString(event.args.judge).toLowerCase();
      if (seat >= 0 && seat < JUDGE_COUNT && judge) selected.set(seat, judge);
    }
    if (event.eventName === "JudgeVoted") {
      const judge = asString(event.args.judge).toLowerCase();
      if (!selectedHas(selected, judge) || votes.has(judge)) continue;
      const approved = event.args.approved === true || String(event.args.approved).toLowerCase() === "true";
      votes.set(judge, { judge, approved });
      if (approved) approveVotes++;
      else rejectVotes++;
    }
    if (event.eventName === "JudgeCaseResolved") {
      const nextStatus = resolvedStatus(event.args.status);
      if (!nextStatus) continue;
      status = nextStatus;
      decisionHash = asString(event.args.decisionHash) || null;
      if (event.args.approveVotes != null) approveVotes = asNumber(event.args.approveVotes);
      if (event.args.rejectVotes != null) rejectVotes = asNumber(event.args.rejectVotes);
    }
  }

  return {
    caseId,
    creator: asString(created.args.creator).toLowerCase(),
    commitmentHash: asString(created.args.commitmentHash).toLowerCase(),
    termsHash: asString(created.args.termsHash).toLowerCase(),
    voteDeadline: asString(created.args.voteDeadline),
    selectionSeed: asString(created.args.selectionSeed).toLowerCase(),
    status,
    judges: [...selected.entries()].sort(([a], [b]) => a - b).map(([, judge]) => judge),
    votes: [...votes.values()],
    approveVotes,
    rejectVotes,
    decisionHash,
  };
}

function selectedHas(selected: Map<number, string>, judge: string) {
  return [...selected.values()].some(value => value === judge);
}
