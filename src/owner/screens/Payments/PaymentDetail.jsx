import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getPaymentById, deletePayment, updatePayment, getMemberPayments } from '../../../firebase/firestore-payments';
import { updateMember } from '../../../firebase/firestore';
import { sendWhatsApp, buildReceiptParams } from '../../../utils/whatsapp';
import { formatDate } from '../../../utils/helpers';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Badge from '../../primitives/Badge';
import PageSkeleton from '../../primitives/PageSkeleton';
import useOwnerGym from '../../hooks/useOwnerGym';

export default function PaymentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [payment, setPayment] = useState(null);
  const { gym } = useOwnerGym(userDoc?.gym_id);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setPayment(await getPaymentById(id));
      } catch (err) {
        console.error('Error fetching payment:', err);
        showToast('Failed to load payment', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userDoc?.gym_id]);

  const handleDownload = async () => {
    if (payment?.invoice_pdf_url) { window.open(payment.invoice_pdf_url, '_blank'); return; }
    showToast('Generating invoice…', 'success');
    try {
      const functions = getFunctions();
      const result = await httpsCallable(functions, 'generateInvoice')({ paymentId: id });
      if (result.data?.pdf_url) {
        window.open(result.data.pdf_url, '_blank');
        setPayment((prev) => ({ ...prev, invoice_pdf_url: result.data.pdf_url }));
      }
    } catch (err) {
      console.error('Invoice generation failed:', err);
      showToast('PDF not available for this legacy payment.', 'error');
    }
  };

  const handleSendWhatsApp = async () => {
    if (!payment) return;
    try {
      if (payment.invoice_pdf_url) {
        const functions = getFunctions();
        await httpsCallable(functions, 'resendInvoice')({ paymentId: id });
        await updatePayment(id, { invoice_status: 'sent_via_wa' });
        setPayment((prev) => ({ ...prev, invoice_status: 'sent_via_wa' }));
      } else {
        await sendWhatsApp({
          phone: payment.member_phone, templateName: 'payment_receipt',
          params: buildReceiptParams(gym, { name: payment.member_name, phone: payment.member_phone }, payment),
          gymId: payment.gym_id, memberId: payment.member_id,
        });
        await updatePayment(id, { whatsapp_sent: true });
        setPayment((prev) => ({ ...prev, whatsapp_sent: true }));
      }
      showToast('WhatsApp receipt sent!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to send WhatsApp via cloud function', 'error');
    }
  };

  const handleClearDue = async () => {
    try {
      await updatePayment(id, { status: 'paid', pending_amount: 0, paid_amount: payment.final_amount });
      setPayment((prev) => ({ ...prev, status: 'paid', pending_amount: 0 }));
      showToast('Due cleared!', 'success');
    } catch (e) {
      console.error('Clear due error:', e);
      showToast('Failed to clear due', 'error');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePayment(id);
      if (payment?.member_id && userDoc?.gym_id) {
        try {
          const remaining = await getMemberPayments(userDoc.gym_id, payment.member_id);
          const others = remaining.filter((p) => p.id !== id);
          if (others.length === 0) {
            await updateMember(payment.member_id, { plan_id: null, plan_name: 'Plan not Activated', subscription_expiry: null, payment_status: 'pending' });
          } else {
            const best = others.reduce((prev, cur) => {
              const prevEnd = prev.membership_end?.toDate ? prev.membership_end.toDate() : new Date(prev.membership_end || 0);
              const curEnd = cur.membership_end?.toDate ? cur.membership_end.toDate() : new Date(cur.membership_end || 0);
              return curEnd > prevEnd ? cur : prev;
            });
            const endDate = best.membership_end?.toDate ? best.membership_end.toDate() : new Date(best.membership_end);
            const isExpired = endDate < new Date();
            await updateMember(payment.member_id, {
              plan_id: best.plan_id || null, plan_name: best.plan_name || null,
              subscription_expiry: best.membership_end || null, payment_status: isExpired ? 'pending' : (best.status || 'paid'),
            });
          }
        } catch (syncErr) { console.error('Subscription sync error (non-critical):', syncErr); }
      }
      showToast('Payment deleted', 'success');
      navigate('/owner/payments', { replace: true });
    } catch (err) {
      console.error('Delete payment error:', err);
      showToast('Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton variant="card" />;
  if (!payment) return <div style={{ textAlign: 'center', padding: '60px 0' }}><p style={{ fontWeight: 700 }}>Payment not found</p></div>;

  const isPendingOrPartial = payment.status === 'pending' || payment.status === 'partial';

  return (
    <section data-screen-label="Payment detail">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Back
      </button>

      <div className="gl2-grid-2" style={{ alignItems: 'start' }}>
        <div className="gl2-card">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <p className="gl2-eyebrow" style={{ marginBottom: 4 }}>Invoice #{payment.invoice_number}</p>
            <p style={{ margin: '0 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-1px' }}>₹{(payment.final_amount || 0).toLocaleString('en-IN')}</p>
            <Badge variant={payment.status === 'paid' ? 'active' : payment.status === 'partial' ? 'expiring' : 'expired'}>{payment.status}</Badge>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={handleDownload}>Download</button>
            <button type="button" className="gl2-btn" style={{ flex: 1, background: '#25D366', color: '#fff' }} onClick={handleSendWhatsApp}>WhatsApp</button>
            <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
          </div>

          <div className="gl2-summary-rows">
            <div className="gl2-summary-row">
              <span className="gl2-summary-label">Member</span>
              <button type="button" className="gl2-summary-value" style={{ background: 'none', border: 0, color: 'var(--gl2-primary-deep)', cursor: 'pointer', font: 'inherit' }} onClick={() => navigate(`/owner/members/${payment.member_id}`)}>{payment.member_name}</button>
            </div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Phone</span><span className="gl2-summary-value">{payment.member_phone}</span></div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Plan</span><span className="gl2-summary-value">{payment.plan_name}</span></div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Amount</span><span className="gl2-summary-value">₹{payment.amount}</span></div>
            {payment.discount > 0 && <div className="gl2-summary-row"><span className="gl2-summary-label">Discount</span><span className="gl2-summary-value" style={{ color: 'var(--gl2-success-fg)' }}>- ₹{payment.discount}</span></div>}
            <div className="gl2-summary-row"><span className="gl2-summary-label">Final amount</span><span className="gl2-summary-value">₹{payment.final_amount}</span></div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Method</span><span className="gl2-summary-value">{payment.method === 'cash' ? 'Cash' : payment.method === 'upi' ? 'UPI' : 'Online'}{payment.upi_ref ? ` · ${payment.upi_ref}` : ''}</span></div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Payment date</span><span className="gl2-summary-value">{formatDate(payment.payment_date)}</span></div>
            <div className="gl2-summary-row"><span className="gl2-summary-label">Membership</span><span className="gl2-summary-value">{formatDate(payment.membership_start)} → {formatDate(payment.membership_end)}</span></div>
            <div className="gl2-summary-row">
              <span className="gl2-summary-label">WhatsApp receipt</span>
              <span className="gl2-summary-value" style={{ color: payment.invoice_status === 'sent_via_wa' || payment.whatsapp_sent ? 'var(--gl2-success-fg)' : payment.invoice_status === 'wa_failed' ? 'var(--gl2-danger-fg)' : undefined }}>
                {payment.invoice_status === 'sent_via_wa' ? '✓ Auto-delivered' : payment.invoice_status === 'wa_failed' ? '✕ Delivery failed' : payment.whatsapp_sent ? '✓ Sent' : 'Not sent'}
              </span>
            </div>
            {payment.notes && <div className="gl2-summary-row"><span className="gl2-summary-label">Notes</span><span className="gl2-summary-value">{payment.notes}</span></div>}
            {isPendingOrPartial && (
              <div className="gl2-summary-row" style={{ background: 'var(--gl2-warning-bg)' }}>
                <span className="gl2-summary-label" style={{ color: 'var(--gl2-warning-fg)' }}>Pending amount</span>
                <span className="gl2-summary-value" style={{ color: 'var(--gl2-warning-fg)' }}>₹{payment.pending_amount || payment.final_amount}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {payment.screenshot_url && (
            <div className="gl2-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p className="gl2-card-title">UPI screenshot</p>
                <a href={payment.screenshot_url} target="_blank" rel="noreferrer">Open full</a>
              </div>
              <img src={payment.screenshot_url} alt="UPI Screenshot" style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 300 }} />
            </div>
          )}
          {isPendingOrPartial && (
            <button type="button" className="gl2-btn gl2-btn-lg" style={{ background: 'var(--gl2-success-fg)', color: '#fff' }} onClick={handleClearDue}>
              ✓ {payment.screenshot_url ? 'Verify & clear due' : 'Clear due'}
            </button>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, textAlign: 'center', color: 'var(--gl2-danger-fg)' }}>Delete payment?</p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--gl2-muted)', textAlign: 'center' }}>This cannot be undone. Invoice #{payment.invoice_number} will be deleted.</p>
            <button type="button" className="gl2-btn gl2-btn-lg" style={{ width: '100%', marginBottom: 10, background: 'var(--gl2-danger-strong)', color: '#fff' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
            <button type="button" className="gl2-btn gl2-btn-secondary gl2-btn-lg" style={{ width: '100%' }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
