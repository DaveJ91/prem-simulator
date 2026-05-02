import { motion, AnimatePresence } from 'framer-motion';
import type { Standing } from '../standings';
import { DISPLAY_NAME, LOGOS } from '../logos';

type Props = {
  standings: Standing[];
  survival: Record<string, number>;
};

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pct(p: number): string {
  if (p >= 0.99995) return '100.00%';
  if (p <= 0.00005) return '0.00%';
  return `${(p * 100).toFixed(2)}%`;
}

function survivalClass(p: number): string {
  if (p >= 0.85) return 'safe';
  if (p >= 0.4) return 'medium';
  return 'danger';
}

export function LeagueTable({ standings, survival }: Props) {
  const slice = standings.slice(14, 20);
  const startPos = 15;
  return (
    <div className="fm-table">
      <div className="fm-row fm-head">
        <span className="col-pos">POS</span>
        <span className="col-inf">INF</span>
        <span className="col-team">TEAM</span>
        <span>P</span>
        <span className="col-w">W</span>
        <span className="col-d">D</span>
        <span className="col-l">L</span>
        <span>GD</span>
        <span>PTS</span>
        <span className="col-surv">SURVIVAL %</span>
      </div>
      <div className="fm-body">
        <AnimatePresence initial={false}>
          {slice.map((t, i) => {
            const pos = startPos + i;
            const cls = ['fm-row', 'fm-data', pos >= 18 ? 'rel' : ''].filter(Boolean).join(' ');
            const survP = survival[t.short] ?? 0;
            return (
              <motion.div
                key={t.short}
                layout
                className={cls}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  layout: { type: 'spring', stiffness: 380, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
              >
                <span className="col-pos">{ordinal(pos)}</span>
                <span className="col-inf">{survP <= 0.00005 && <span className="rel-letter">R</span>}</span>
                <span className="col-team">
                  {LOGOS[t.short] && (
                    <img className="club-logo" src={LOGOS[t.short]} alt="" />
                  )}
                  <span className="club-name">{DISPLAY_NAME[t.short] ?? t.name}</span>
                </span>
                <span>{t.played}</span>
                <span className="col-w">{t.won}</span>
                <span className="col-d">{t.drawn}</span>
                <span className="col-l">{t.lost}</span>
                <span>{t.gd > 0 ? `+${t.gd}` : t.gd}</span>
                <span className="pts">{t.points}</span>
                <span className={`col-surv surv-${survivalClass(survP)}`}>
                  {pct(survP)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
