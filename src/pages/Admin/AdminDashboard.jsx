// src/pages/Admin/AdminDashboard.jsx
// Super-Admin Portal — Revenue Metrics, Manual Payments, Trials, Tickets

import { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase/config';
import {
  collection, getDocs, getDoc, doc, addDoc,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { useToast } from '../../context/ToastContext';
import './AdminDashboard.css';

const PLAN_COLORS = {
  FREE: '#aaa',
  BASIC: '#4A90E2',
  PROFESSIONAL: '#1D9E75',
  PROFESSIONAL_PLUS: '#EF9F27',
  PREMIUM: '#9C27B0',
};

const PLAN_PRICES = { FREE: 0, BASIC: 199, PROFESSIONAL: 499, PROFESSIONAL_PLUS: 799, PREMIUM: 999 };

const planBadgeClass = (plan) => {
  switch (plan) {
    case 'PREMIUM': return 'purple';
    case 'PROFESSIONAL_PLUS': return 'orange';
    case 'PROFESSIONAL': return 'green';
    case 'BASIC': return 'blue';
    default: return 'grey';
  }
};

export default function AdminDashboard() {
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [gyms, setGyms] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [failedPayments, setFailedPayments] = useState([]);
  const [activeTrials, setActiveTrials] = useState([]);
  const [manualModal, setManualModal] = useState(false);
  const [selectedGymId, setSelectedGymId] = useState('');
  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'cash',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    bankName: '',
    utr: '',
    depositor: '',
  });
  const [saving, setSaving] = useState(false);

  // Guard: admin only
  useEffect(() => {
    if (userDoc && userDoc.role !== 'admin') {
      navigate('/owner/dashboard', { replace: true });
    }
  }, [userDoc, navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (localStorage.getItem('mockRole')) {
      const mockGyms = [
        {
          id: 'mock_gym_123',
          name: 'Iron Temple Fitness',
          city: 'Mumbai',
          owner_name: 'John Gymly',
          subscription: {
            plan: 'PREMIUM',
            status: 'active',
            is_trial: true,
            trial_end_date: { toDate: () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
            amount_monthly: 99900,
            failed_payment_count: 0
          }
        },
        {
          id: 'mock_gym_456',
          name: 'Powerhouse Gym',
          city: 'Delhi',
          owner_name: 'Jane Doe',
          subscription: {
            plan: 'PROFESSIONAL_PLUS',
            status: 'past_due',
            is_trial: false,
            amount_monthly: 79900,
            failed_payment_count: 2
          }
        },
        {
          id: 'mock_gym_789',
          name: 'Gold\'s Gym Pune',
          city: 'Pune',
          owner_name: 'Michael Scott',
          subscription: {
            plan: 'FREE',
            status: 'active',
            is_trial: false,
            amount_monthly: 0,
            failed_payment_count: 0
          }
        }
      ];
      setGyms(mockGyms);
      
      const byPlan = { FREE: 1, BASIC: 0, PROFESSIONAL: 0, PROFESSIONAL_PLUS: 1, PREMIUM: 1 };
      const failedList = [
        {
          gymId: 'mock_gym_456',
          gymName: 'Powerhouse Gym',
          ownerName: 'Jane Doe',
          amount: 79900,
          status: 'past_due',
          failCount: 2
        }
      ];
      const trialList = [
        {
          id: 'mock_gym_123',
          name: 'Iron Temple Fitness',
          owner_name: 'John Gymly',
          daysLeft: 5,
          subscription: { is_trial: true, trial_end_date: { toDate: () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) } }
        }
      ];
      setFailedPayments(failedList);
      setActiveTrials(trialList);

      setMetrics({
        totalGyms: 3,
        activeSubscriptions: 2,
        mrr: 999 + 799,
        arr: (999 + 799) * 12,
        churnRate: 3.2,
        byPlan,
        revenueByPlan: [
          { name: 'PREMIUM', gyms: 1, revenue: 999 },
          { name: 'PROFESSIONAL_PLUS', gyms: 1, revenue: 799 }
        ],
        paymentHealth: {
          successful: 2,
          pastDue: 1,
          halted: 0
        }
      });
      setLoading(false);
      return;
    }
    try {
      // Load all gyms + their subscriptions
      const gymsSnap = await getDocs(collection(db, 'gyms'));
      const gymsData = [];

      for (const gymDoc of gymsSnap.docs) {
        const subSnap = await getDoc(doc(db, 'subscriptions', gymDoc.id));
        gymsData.push({
          id: gymDoc.id,
          ...gymDoc.data(),
          subscription: subSnap.exists() ? subSnap.data() : null,
        });
      }
      setGyms(gymsData);

      // Compute metrics
      const byPlan = { FREE: 0, BASIC: 0, PROFESSIONAL: 0, PROFESSIONAL_PLUS: 0, PREMIUM: 0 };
      let mrr = 0;
      let activeCount = 0;
      let failedList = [];
      let trialList = [];

      for (const gym of gymsData) {
        const plan = gym.subscription?.plan || 'FREE';
        byPlan[plan] = (byPlan[plan] || 0) + 1;
        const status = gym.subscription?.status || 'active';
        if (status === 'active') {
          mrr += PLAN_PRICES[plan] || 0;
          activeCount++;
        }
        if (status === 'past_due' || status === 'halted') {
          failedList.push({
            gymId: gym.id,
            gymName: gym.name,
            ownerName: gym.owner_name || '—',
            amount: gym.subscription?.amount_monthly || 0,
            status,
            failCount: gym.subscription?.failed_payment_count || 0,
          });
        }
        if (gym.subscription?.is_trial) {
          const endDate = gym.subscription.trial_end_date?.toDate?.();
          const daysLeft = endDate
            ? Math.max(0, Math.ceil((endDate - Date.now()) / 86400000))
            : 0;
          trialList.push({ ...gym, daysLeft });
        }
      }

      setFailedPayments(failedList);
      setActiveTrials(trialList);

      const revenueByPlan = Object.entries(byPlan).map(([name, count]) => ({
        name,
        gyms: count,
        revenue: count * (PLAN_PRICES[name] || 0),
      })).filter(d => d.revenue > 0);

      setMetrics({
        totalGyms: gymsData.length,
        activeSubscriptions: activeCount,
        mrr,
        arr: mrr * 12,
        churnRate: 3.2, // placeholder
        byPlan,
        revenueByPlan,
        paymentHealth: {
          successful: activeCount,
          pastDue: failedList.filter(f => f.status === 'past_due').length,
          halted: failedList.filter(f => f.status === 'halted').length,
        },
      });
    } catch (err) {
      console.error('Admin dashboard error:', err);
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddManualPayment = async () => {
    if (!selectedGymId || !payForm.amount) {
      showToast('Please select a gym and enter an amount', 'error');
      return;
    }
    setSaving(true);
    try {
      const paymentId = `mp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const amountPaise = Math.round(Number(payForm.amount) * 100);

      // Get subscription for plan info
      const subSnap = await getDoc(doc(db, 'subscriptions', selectedGymId));
      const plan = subSnap.exists() ? subSnap.data().plan : 'FREE';

      // Save manual payment record
      const paymentData = {
        entry_id: paymentId,
        gym_id: selectedGymId,
        amount: amountPaise,
        plan,
        payment_method: payForm.method,
        payment_date: new Date(payForm.date),
        status: 'verified',
        notes: payForm.notes || '',
        invoice_generated: true,
        created_at: serverTimestamp(),
        created_by_admin: userDoc?.id || 'admin',
      };

      if (payForm.method === 'bank_transfer') {
        paymentData.bank_name = payForm.bankName;
        paymentData.utr_number = payForm.utr;
        paymentData.depositor_name = payForm.depositor;
      }

      await addDoc(
        collection(db, 'billing', selectedGymId, 'manual_payments'),
        paymentData
      );

      // Log action
      await addDoc(collection(db, 'admin_logs'), {
        action: 'manual_payment_added',
        gym_id: selectedGymId,
        amount: amountPaise,
        method: payForm.method,
        admin_id: userDoc?.id || 'admin',
        timestamp: serverTimestamp(),
      });

      showToast(`Payment of ₹${payForm.amount} logged successfully!`, 'success');
      setManualModal(false);
      setPayForm({ amount: '', method: 'cash', date: new Date().toISOString().split('T')[0], notes: '', bankName: '', utr: '', depositor: '' });
      setSelectedGymId('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Failed to add payment: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const gymName = (id) => gyms.find(g => g.id === id)?.name || id;

  if (loading) {
    return (
      <div className="screen admin-screen">
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner spinner-primary" style={{ width: 36, height: 36 }} />
        </div>
      </div>
    );
  }

  const pieData = metrics?.revenueByPlan || [];

  return (
    <div className="screen admin-screen">
      <div className="screen-content">

        {/* Header */}
        <div className="admin-header">
          <div>
            <h1>Admin Dashboard</h1>
            <div className="admin-header-sub">Gymly Platform · {metrics?.totalGyms} gyms</div>
          </div>
          <button
            className="btn-primary"
            style={{ fontSize: 13, padding: '9px 14px', whiteSpace: 'nowrap' }}
            onClick={() => setManualModal(true)}
          >
            + Manual Payment
          </button>
        </div>

        <div className="admin-content">

          {/* ── Key Metrics ── */}
          {metrics && (
            <div className="admin-metrics-grid">
              <div className="admin-metric-card">
                <div className="admin-metric-label">Total Gyms</div>
                <div className="admin-metric-value">{metrics.totalGyms}</div>
                <div className="admin-metric-sub">All time</div>
              </div>
              <div className="admin-metric-card">
                <div className="admin-metric-label">Active Subs</div>
                <div className="admin-metric-value">{metrics.activeSubscriptions}</div>
                <div className="admin-metric-sub">
                  {metrics.totalGyms > 0
                    ? Math.round((metrics.activeSubscriptions / metrics.totalGyms) * 100)
                    : 0}% conversion
                </div>
              </div>
              <div className="admin-metric-card">
                <div className="admin-metric-label">MRR</div>
                <div className="admin-metric-value">₹{metrics.mrr.toLocaleString('en-IN')}</div>
                <div className="admin-metric-sub">ARR ₹{metrics.arr.toLocaleString('en-IN')}</div>
              </div>
              <div className="admin-metric-card">
                <div className="admin-metric-label">Churn Rate</div>
                <div className="admin-metric-value">{metrics.churnRate}%</div>
                <div className="admin-metric-sub warn">
                  {failedPayments.length} past due
                </div>
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          {metrics && (
            <div className="admin-charts-row">
              {/* Revenue by Plan (Pie) */}
              <div className="admin-chart-card">
                <div className="admin-chart-title">Revenue by Plan (MRR)</div>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={80}
                        label={({ name, revenue }) => revenue > 0 ? `₹${revenue}` : null}
                        labelLine={false}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={PLAN_COLORS[entry.name] || '#ccc'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `₹${v}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="admin-empty">No paid subscriptions yet</div>
                )}
              </div>

              {/* Gym Distribution (Bar) */}
              <div className="admin-chart-card">
                <div className="admin-chart-title">Gyms by Plan</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={Object.entries(metrics.byPlan)
                      .filter(([, v]) => v > 0)
                      .map(([name, gyms]) => ({ name, gyms }))}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="gyms" radius={[4, 4, 0, 0]}>
                      {Object.entries(metrics.byPlan)
                        .filter(([, v]) => v > 0)
                        .map(([name]) => (
                          <Cell key={name} fill={PLAN_COLORS[name] || '#ccc'} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Payment Health ── */}
          {metrics && (
            <div className="admin-section">
              <div className="admin-section-title">Payment Health</div>
              <div className="admin-card">
                <div className="payment-health-row">
                  <div className="payment-health-item">
                    <div className="payment-health-value" style={{ color: '#1D9E75' }}>
                      {metrics.paymentHealth.successful}
                    </div>
                    <div className="payment-health-label">Successful<br />(last 30d)</div>
                  </div>
                  <div className="payment-health-item">
                    <div className="payment-health-value" style={{ color: '#EF9F27' }}>
                      {metrics.paymentHealth.pastDue}
                    </div>
                    <div className="payment-health-label">Past Due<br />(retry pending)</div>
                  </div>
                  <div className="payment-health-item">
                    <div className="payment-health-value" style={{ color: 'var(--error)' }}>
                      {metrics.paymentHealth.halted}
                    </div>
                    <div className="payment-health-label">Halted<br />(action needed)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Failed Payments ── */}
          {failedPayments.length > 0 && (
            <div className="admin-section">
              <div className="admin-section-title">
                Failed / Past-Due Payments ({failedPayments.length})
              </div>
              <div className="admin-card">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Gym</th>
                        <th>Owner</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedPayments.map(p => (
                        <tr key={p.gymId}>
                          <td>{p.gymName}</td>
                          <td>{p.ownerName}</td>
                          <td>₹{(p.amount / 100).toFixed(0)}</td>
                          <td>
                            <span className={`admin-badge ${p.status === 'halted' ? 'red' : 'orange'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="admin-action-btn"
                              onClick={() => {
                                setSelectedGymId(p.gymId);
                                setManualModal(true);
                              }}
                            >
                              Log Payment
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Active Trials ── */}
          {activeTrials.length > 0 && (
            <div className="admin-section">
              <div className="admin-section-title">
                Active Free Trials ({activeTrials.length})
              </div>
              <div className="admin-card">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Gym</th>
                        <th>Owner</th>
                        <th>Days Left</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTrials.map(g => (
                        <tr key={g.id}>
                          <td>{g.name}</td>
                          <td>{g.owner_name || '—'}</td>
                          <td>
                            <span className={`admin-badge ${g.daysLeft <= 3 ? 'red' : 'blue'}`}>
                              {g.daysLeft}d left
                            </span>
                          </td>
                          <td>
                            <span className="admin-badge blue">Trial</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── All Gyms ── */}
          <div className="admin-section">
            <div className="admin-section-title">All Gyms ({gyms.length})</div>
            <div className="admin-card">
              {gyms.length === 0 ? (
                <div className="admin-empty">No gyms registered yet</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Gym</th>
                        <th>City</th>
                        <th>Plan</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gyms.map(g => {
                        const plan = g.subscription?.plan || 'FREE';
                        const status = g.subscription?.status || 'active';
                        return (
                          <tr key={g.id}>
                            <td style={{ fontWeight: 600 }}>{g.name}</td>
                            <td>{g.city || '—'}</td>
                            <td>
                              <span
                                className="plan-dot"
                                style={{ background: PLAN_COLORS[plan] }}
                              />
                              <span className={`admin-badge ${planBadgeClass(plan)}`}>
                                {plan.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <span className={`admin-badge ${status === 'active' ? 'green' : status === 'past_due' ? 'orange' : 'red'}`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Manual Payment Modal ── */}
      {manualModal && (
        <div className="admin-modal-overlay" onClick={() => setManualModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Log Manual Payment</h3>

            <div className="input-group">
              <label className="input-label">Select Gym *</label>
              <select
                className="input-field"
                value={selectedGymId}
                onChange={e => setSelectedGymId(e.target.value)}
              >
                <option value="">Choose gym...</option>
                {gyms.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.subscription?.plan || 'FREE'})
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Amount (₹) *</label>
              <input
                type="number"
                className="input-field"
                placeholder="e.g. 999"
                value={payForm.amount}
                onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Payment Method</label>
              <select
                className="input-field"
                value={payForm.method}
                onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Payment Date</label>
              <input
                type="date"
                className="input-field"
                value={payForm.date}
                onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>

            {payForm.method === 'bank_transfer' && (
              <>
                <div className="input-group">
                  <label className="input-label">Bank Name</label>
                  <input
                    className="input-field"
                    placeholder="e.g. HDFC Bank"
                    value={payForm.bankName}
                    onChange={e => setPayForm(p => ({ ...p, bankName: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">UTR Number</label>
                  <input
                    className="input-field"
                    placeholder="16-digit UTR"
                    value={payForm.utr}
                    onChange={e => setPayForm(p => ({ ...p, utr: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Depositor Name</label>
                  <input
                    className="input-field"
                    placeholder="Name on transfer"
                    value={payForm.depositor}
                    onChange={e => setPayForm(p => ({ ...p, depositor: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="input-group">
              <label className="input-label">Notes</label>
              <textarea
                className="input-field"
                placeholder="Optional notes..."
                rows={2}
                style={{ resize: 'none' }}
                value={payForm.notes}
                onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="admin-modal-btns">
              <button className="btn-ghost" onClick={() => setManualModal(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleAddManualPayment}
                disabled={saving}
              >
                {saving ? <div className="spinner" /> : 'Log Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
