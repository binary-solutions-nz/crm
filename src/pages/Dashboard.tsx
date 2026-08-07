import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { useCollection } from '../lib/useCollection';
import { SUBSCRIPTION_CATEGORY_LABELS, type Client, type Service, type Subscription } from '../types';
import { daysUntil, formatDate, formatMoney, relativeRenewal } from '../lib/dates';
import { Loading, PageHeader, RenewalBadge } from '../components/ui';

// Normalise any billing cycle to an approximate monthly figure for MRR.
function toMonthly(cost: number | undefined, cycle: string | undefined): number {
  if (!cost) return 0;
  switch (cycle) {
    case 'annual':
      return cost / 12;
    case 'quarterly':
      return cost / 3;
    case 'monthly':
      return cost;
    default:
      return 0; // one-off doesn't contribute to recurring revenue
  }
}

export default function Dashboard() {
  const clients = useCollection<Client>('clients', [orderBy('name')]);
  const subs = useCollection<Subscription>('subscriptions', [orderBy('renewalDate')]);
  const services = useCollection<Service>('services', []);

  const clientMap = useMemo(
    () => Object.fromEntries(clients.data.map((c) => [c.id, c.name])),
    [clients.data]
  );

  const stats = useMemo(() => {
    const activeClients = clients.data.filter((c) => c.status === 'active').length;
    const activeSubs = subs.data.filter((s) => s.status === 'active');
    const due30 = activeSubs.filter((s) => {
      const d = daysUntil(s.renewalDate);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const overdue = activeSubs.filter((s) => {
      const d = daysUntil(s.renewalDate);
      return d !== null && d < 0;
    }).length;

    const subMrr = activeSubs.reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0);
    const svcMrr = services.data
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0);

    return {
      activeClients,
      totalClients: clients.data.length,
      activeSubs: activeSubs.length,
      due30,
      overdue,
      mrr: subMrr + svcMrr,
    };
  }, [clients.data, subs.data, services.data]);

  const upcoming = useMemo(() => {
    return subs.data
      .filter((s) => {
        if (s.status !== 'active') return false;
        const d = daysUntil(s.renewalDate);
        return d !== null && d <= 45;
      })
      .slice(0, 10);
  }, [subs.data]);

  if (clients.loading && subs.loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Overview for ${new Date().toLocaleDateString('en-NZ', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
      />

      <div className="kpi-grid">
        <KpiCard label="Active clients" value={stats.activeClients} sub={`${stats.totalClients} total`} to="/clients" />
        <KpiCard label="Active subscriptions" value={stats.activeSubs} to="/subscriptions" />
        <KpiCard
          label="Renewing ≤ 30 days"
          value={stats.due30}
          tone={stats.due30 > 0 ? 'amber' : 'default'}
          to="/renewals"
        />
        <KpiCard
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue > 0 ? 'red' : 'default'}
          to="/renewals"
        />
        <KpiCard label="Est. monthly recurring" value={formatMoney(stats.mrr)} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Renewals in the next 45 days</h2>
          <Link to="/renewals" className="link">
            View all →
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="panel-empty">Nothing renewing in the next 45 days.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Date</th>
                  <th>Subscription</th>
                  <th>Client</th>
                  <th>Category</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <RenewalBadge date={s.renewalDate}>
                        {relativeRenewal(s.renewalDate)}
                      </RenewalBadge>
                    </td>
                    <td>{formatDate(s.renewalDate)}</td>
                    <td className="cell-strong">{s.name}</td>
                    <td>
                      {clientMap[s.clientId] ? (
                        <Link to={`/clients/${s.clientId}`} className="link">
                          {clientMap[s.clientId]}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{SUBSCRIPTION_CATEGORY_LABELS[s.category]}</td>
                    <td>{formatMoney(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'amber' | 'red';
  to?: string;
}) {
  const inner = (
    <div className={`kpi-card kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
  return to ? (
    <Link to={to} className="kpi-link">
      {inner}
    </Link>
  ) : (
    inner
  );
}
