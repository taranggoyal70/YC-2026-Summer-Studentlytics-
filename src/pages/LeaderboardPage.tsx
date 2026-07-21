import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Medal, MessageCircle, HelpCircle, Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { getLeaderboard, LeaderboardEntry } from '../services/insightsService'
import { toCsv, downloadCsv } from '../utils/csv'

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLeaderboard()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leaderboard'))
      .finally(() => setLoading(false))
  }, [])

  const ranked = entries.filter((e) => e.avg_engagement != null)
  const unranked = entries.filter((e) => e.avg_engagement == null)

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-4xl font-bold mb-2">Engagement Leaderboard</h1>
        <p className="text-xl text-muted-foreground mb-10">
          Ranked by average engagement score across analyzed sessions. Scores are review signals backed by evidence, not standalone judgments.
        </p>

        {ranked.length > 0 && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={() =>
                downloadCsv(
                  `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`,
                  toCsv(ranked as unknown as Record<string, unknown>[]),
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              Export CSV ({ranked.length})
            </button>
          </div>
        )}

        {loading && <p className="text-muted-foreground">Loading leaderboard…</p>}
        {error && <p className="text-destructive">{error}</p>}

        {!loading && !error && ranked.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              No analyzed sessions yet. Upload a session recording and run analysis to populate the leaderboard.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {ranked.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              <Card className={index === 0 ? 'border-yellow-400/60' : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold">
                        {index === 0 ? <Trophy className="h-5 w-5 text-yellow-500" /> : index < 3 ? <Medal className="h-5 w-5 text-slate-500" /> : index + 1}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{entry.name}</CardTitle>
                        <CardDescription>
                          {entry.external_id}
                          {entry.major ? ` · ${entry.major}` : ''}
                          {entry.cohort ? ` · ${entry.cohort}` : ''}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{entry.avg_engagement}</p>
                      <p className="text-xs text-muted-foreground">avg engagement</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                  <span>
                    Attendance: {entry.attendance_rate != null ? `${entry.attendance_rate}%` : '—'} ({entry.sessions_attended}/{entry.sessions_analyzed} sessions)
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" /> {entry.total_words ?? 0} words spoken
                  </span>
                  <span className="flex items-center gap-1">
                    <HelpCircle className="h-4 w-4" /> {entry.total_questions ?? 0} questions asked
                  </span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {unranked.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-3">Not yet analyzed</h2>
            <p className="text-sm text-muted-foreground mb-4">
              These participants are on the roster but have no analyzed sessions yet.
            </p>
            <div className="flex flex-wrap gap-2">
              {unranked.map((entry) => (
                <span key={entry.id} className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
                  {entry.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
