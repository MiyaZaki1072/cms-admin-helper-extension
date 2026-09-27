import type { Submission, Task } from '@/core/model';
import { formatDateTime, formatTime } from '@/core/time';
import { scoreClass } from './useTracker';

interface Props {
  submissions: readonly Submission[];
  tasks: readonly Task[];
  /** ms; the axis spans start..end. */
  start: number | null;
  end: number | null;
}

const WIDTH = 1000;
const ROW = 26;
const LEFT = 90;

/** One row per task, one dot per submission, coloured by result. */
export function Timeline({ submissions, tasks, start, end }: Props) {
  const times = submissions.map((s) => s.timestamp);
  const from = start ?? Math.min(...times);
  const to = Math.max(end ?? Math.max(...times), from + 60_000);
  if (submissions.length === 0 || !Number.isFinite(from)) return <p class="cah-muted">No submissions yet.</p>;
  const rows = tasks.length > 0 ? tasks : [...new Map(submissions.map((s) => [s.taskId, { id: s.taskId, name: s.taskName, title: '' }])).values()];
  const x = (t: number) => LEFT + ((t - from) / (to - from)) * (WIDTH - LEFT - 10);
  const height = rows.length * ROW + 22;
  const ticks = Array.from({ length: 6 }, (_, i) => from + ((to - from) * i) / 5);

  return (
    <svg class="cah-timeline" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="Submission timeline">
      {rows.map((task, i) => (
        <g key={task.id}>
          <text x={4} y={i * ROW + 17} class="cah-tl-label">
            {task.name}
          </text>
          <line x1={LEFT} x2={WIDTH - 10} y1={i * ROW + 13} y2={i * ROW + 13} class="cah-tl-axis" />
          {submissions
            .filter((s) => s.taskId === task.id)
            .map((s) => (
              <circle key={s.id} cx={x(s.timestamp)} cy={i * ROW + 13} r={6} class={`cah-tl-dot ${scoreClass(s)}`}>
                <title>
                  {`${formatDateTime(s.timestamp)} · ${s.taskName} · ${s.statusText} (#${s.id})`}
                </title>
              </circle>
            ))}
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={height - 4} class="cah-tl-tick" text-anchor="middle">
          {formatTime(t)}
        </text>
      ))}
    </svg>
  );
}
