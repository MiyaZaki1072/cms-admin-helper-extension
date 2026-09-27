/**
 * Typed objects parsed from AWS pages. Times are milliseconds since the epoch
 * (UTC), converted from the UTC strings AWS prints.
 */

/** What the logged-in admin may do (AWS: permission_all / permission_messaging). */
export type PermissionLevel = 'all' | 'messaging' | 'readonly';

export interface Contest {
  id: number;
  name: string;
  description: string;
}

/** From the AWSUtils(...) call every contest page makes. Seconds since the epoch. */
export interface ContestTimes {
  serverNow: number;
  start: number;
  stop: number;
  analysisStart: number;
  analysisStop: number;
  /** AWS phase: -1 before start, 0 running, 1 between end and analysis, 2 analysis, 3 over. */
  phase: number;
}

export interface Task {
  id: number;
  name: string;
  title: string;
}

export interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
}

export interface Team {
  id: number;
  code: string;
  name: string;
}

export type SubmissionStatus = 'compiling' | 'compilation_failed' | 'evaluating' | 'scoring' | 'scored' | 'unknown';

export interface SubmissionFile {
  name: string;
  fileId: number;
}

export interface Submission {
  id: number;
  /** ms since epoch, UTC. */
  timestamp: number;
  contestId: number;
  userId: number;
  username: string;
  taskId: number;
  taskName: string;
  status: SubmissionStatus;
  /** Text as AWS shows it, e.g. "Scored (60.0 / 100.0)". */
  statusText: string;
  score: number | null;
  maxScore: number | null;
  official: boolean;
  token: boolean;
  comment: string;
  datasetId: number | null;
  files: SubmissionFile[];
}

/** One row of "Evaluation (as seen by the admin)" on the submission page. */
export interface Testcase {
  index: number;
  codename: string;
  /** Outcome as AWS prints it, usually a number such as "1.0"; "" if not evaluated. */
  outcome: string;
  details: string;
  /** e.g. "(0.067 s) (0.076 s) (3 MiB)": CPU time, wall time, memory. */
  resources: string;
  verdict: 'correct' | 'partial' | 'wrong' | 'unknown';
}

export interface SubmissionDetail {
  id: number;
  timestamp: number;
  taskId: number;
  taskName: string;
  contestId: number;
  userId: number;
  username: string;
  language: string;
  files: SubmissionFile[];
  status: SubmissionStatus;
  statusText: string;
  score: number | null;
  maxScore: number | null;
  official: boolean;
  testcases: Testcase[];
  compilationOutcome: string;
  compilationStdout: string;
  compilationStderr: string;
}

export type PasswordMethod = 'plaintext' | 'bcrypt';

/** The participation form on /contest/{c}/user/{u}/edit, field by field. */
export interface ParticipationForm {
  team: string;
  /** Plaintext password, or "" when unset or hashed. */
  password: string;
  method: PasswordMethod;
  hidden: boolean;
  unrestricted: boolean;
  /** Comma list as AWS shows it, e.g. "10.0.0.50/32, 192.168.1.0/24". */
  ip: string;
  /** UTC "YYYY-MM-DD HH:MM:SS[.ffffff]" or "". */
  startingTime: string;
  /** Seconds. */
  delayTime: number;
  /** Seconds. */
  extraTime: number;
}

export interface Question {
  /** From the reply/claim form; null if the page shows no form (no permission). */
  id: number | null;
  userId: number;
  username: string;
  fullName: string;
  timestamp: number;
  subject: string;
  text: string;
  answered: boolean;
  ignored: boolean;
  replySubject: string;
  replyText: string;
}

export interface Announcement {
  id: number | null;
  timestamp: number;
  subject: string;
  text: string;
  author: string;
}

export interface Message {
  timestamp: number;
  subject: string;
  text: string;
  author: string;
}

export interface Participation {
  /** Id of the participation itself (for re-evaluation), from the page's re-evaluate buttons. */
  participationId: number | null;
  contestId: number;
  userId: number;
  username: string;
  form: ParticipationForm;
  /** Every field of the form, as the browser would send it (for read-modify-write). */
  fields: Array<[string, string]>;
  /** Team codes offered by the form's datalist. */
  teamCodes: string[];
  submissionCount: number;
  submissions: Submission[];
  submissionPages: number;
  questions: Question[];
  messages: Message[];
}

export interface RankingRow {
  userId: number;
  username: string;
  fullName: string;
  teamId: number | null;
  teamName: string;
  /** Score per task id. */
  scores: Record<number, number>;
  total: number;
}

export interface AdminRow {
  id: number | null;
  username: string;
  name: string;
  enabled: boolean;
  permissionAll: boolean;
  permissionMessaging: boolean;
  /** The row links to the admin page (always for full admins, only self otherwise). */
  linked: boolean;
}
