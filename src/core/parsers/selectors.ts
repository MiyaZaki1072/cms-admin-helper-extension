/**
 * Every CSS selector, table header and URL pattern the parsers rely on, for
 * CMS v1.5 AdminWebServer (cms/server/admin/templates). If AWS markup
 * changes, this is the file to update; the fixture tests show which parser
 * broke.
 */

/** Present on every AWS page (base.html). */
export const PAGE = {
  body: 'body.admin',
  sidebar: '#sidebar',
  core: '#core',
  stylesheet: 'link[href*="aws_style.css"]',
  utilsScript: 'script[src*="aws_utils.js"]',
  loginNotice: '#sidebar .login_notice',
  loginNoticeName: '#sidebar .login_notice > a',
  /** Sidebar h1.child holds the contest name on contest pages. */
  contestName: '#sidebar h1.child',
  sidebarMenu: '#sidebar ul.menu',
  /** "(create new ...)" links, shown only to admins with permission_all (non-contest pages). */
  createLinks: '#sidebar a.menu_link[href$="/add"]',
  loginForm: 'form[action*="login"] input[name="username"]',
  unansweredBadge: '#unanswered_questions',
} as const;

/** new CMS.AWSUtils("url", now, start, stop, analysis_start, analysis_stop, phase) */
export const AWS_UTILS_CALL =
  /CMS\.AWSUtils\(\s*"[^"]*"\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?\d+)\s*\)/;

/** Submission tables (macro/submission.html), on contest submissions and participation pages. */
export const SUBMISSIONS = {
  container: '#submissions',
  table: 'table.bordered',
  headers: ['Time', 'User', 'Task', 'Status', 'Files', 'Token', 'Official', 'Comment', 'Reevaluate'],
  /** Direct rows only: scored rows contain nested testcase tables. */
  rows: ':scope > tbody > tr',
  statusTitle: 'div.toggling_off',
  pager: '#submissions > div',
  empty: 'No submissions found.',
  /** "Reevaluate all 300 submissions ..." */
  countText: /Reevaluate all (\d+) submissions/,
} as const;

export const STATUS_TEXT = {
  compiling: 'Compiling...',
  compilationFailed: 'Compilation failed',
  evaluating: 'Evaluating...',
  scoring: 'Scoring...',
  scored: /^Scored \(([\d.]+) \/ ([^)]+)\)$/,
} as const;

/** URL fragments (hrefs are relative, e.g. "../../contest/1/user/15/edit"). */
export const HREF = {
  submission: /(?:^|\/)submission\/(\d+)(?:$|[/?#])/,
  participation: /(?:^|\/)contest\/(\d+)\/user\/(\d+)\/edit/,
  task: /(?:^|\/)task\/(\d+)(?:$|[/?#])/,
  contest: /(?:^|\/)contest\/(\d+)(?:$|[/?#])/,
  user: /(?:^|\/)user\/(\d+)(?:$|[/?#])/,
  team: /(?:^|\/)team\/(\d+)(?:$|[/?#])/,
  admin: /(?:^|\/)admin\/(\d+)(?:$|[/?#])/,
  page: /[?&]page=(\d+)/,
  question: /(?:^|\/)question\/(\d+)\//,
  announcement: /(?:^|\/)announcement\/(\d+)/,
  /** utils.show_file('max.py','../../submission_file/300') */
  showFile: /show_file\('([^']*)'\s*,\s*'[^']*submission_file\/(\d+)'\)/,
  datasetId: /'dataset_id':\s*(\d+)/,
  participationId: /'participation_id':\s*(\d+)/,
} as const;

export const PARTICIPATION = {
  title: '#core > h1',
  form: '#participation_info form',
  teamDatalist: '#teams option',
  questions: '#questions .notification',
  messages: '#messages .notification',
  timestamp: '.notification_timestamp',
  subject: '.notification_subject',
  text: '.notification_text',
  owner: '.notification_admin_owner',
  replyForm: 'form.reply_question_form',
} as const;

/** Tables with a radio column then links: users, contest users, tasks, contests. */
export const LISTS = {
  table: '#core table.bordered',
  rows: ':scope > tbody > tr',
  contestUsersHeaders: ['', 'Username', 'First name', 'Last name'],
  usersHeaders: ['', 'Username', 'First name', 'Last name'],
  contestTasksHeaders: ['', 'Name', 'Title'],
  contestsHeaders: ['', 'Name', 'Description'],
  teamsHeaders: ['Code', 'Name'],
  adminsHeaders: ['Enabled', 'Username', 'Name', 'All permissions', 'Messaging permissions'],
  addUserSelect: 'form[action$="/users/add"] select[name="user_id"] option',
} as const;

export const RANKING = {
  table: '#ranking-table',
  fixedHeaders: ['Username', 'User'],
  /** AWS shows this column only when some participation in the contest has a team. */
  teamHeader: 'Team',
  lastHeader: 'Global',
} as const;

/** /user/{id}: participations table and the user form. */
export const USER_PAGE = {
  form: '#general_info form',
  participations: '#participations table.bordered',
  participationHeaders: ['', 'Participation', 'Hidden?', 'Unrestricted?', 'Contest', 'Contest description'],
} as const;

export const CONTEST_FORM = {
  form: 'form[name="edit_contest"]',
} as const;

export const QUESTIONS = {
  item: '#paged_content_questions > .notification',
  timestamp: '.notification_timestamp',
  userLink: '.notification_timestamp a',
  subject: '.notification_subject',
  text: '.notification_text',
  idForm: 'form.reply_question_form, form.claim_question_form, form.ignore_question_form',
} as const;

export const ANNOUNCEMENTS = {
  item: '#announcements .notification',
  remove: '.announcement_remove a',
  timestamp: '.notification_timestamp',
  subject: '.notification_subject',
  text: '.notification_text',
  owner: '.notification_admin_owner',
} as const;

export const SUBMISSION_PAGE = {
  title: '#core .core_title h1',
  details: '#details table.bordered > tbody > tr',
  status: '#submission_status',
  adminEvaluation: '#evaluation_admin',
  adminEvaluationHeaders: ['#', 'Codename', 'Outcome', 'Visible', 'Details', 'Shard', 'Resources', 'Sandbox'],
  compilation: '#compilation',
} as const;
