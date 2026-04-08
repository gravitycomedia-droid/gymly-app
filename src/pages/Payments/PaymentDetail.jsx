import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getPaymentById, deletePayment, updatePayment } from '../../firebase/firestore-payments';
import { getGym } from '../../firebase/firestore';
import { sendWhatsApp, buildReceiptParams } from '../../utils/whatsapp';
import { formatDate } from '../../utils/helpers';
import './Payments.css';

const PaymentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [payment, setPayment] = useState(null);
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [paymentData, gymData] = await Promise.all([
          getPaymentById(id),
          userDoc?.gym_id ? getGym(userDoc.gym_id) : null,
        ]);
        setPayment(paymentData);
        setGym(gymData);
      } catch (err) {
        console.error('Error fetching payment:', err);
        showToast('Failed to load payment', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, userDoc?.gym_id]);

  const handleDownload = () => {
    if (payment?.invoice_url) {
      window.open(payment.invoice_url, '_blank');
    } else {
      showToast('Invoice PDF not available', 'error');
    }
  };

  const handleSendWhatsApp = async () => {
    if (!payment || !gym) return;
    try {
      await sendWhatsApp({
        phone: payment.member_phone,
        templateName: 'payment_receipt',
        params: buildReceiptParams(gym, { name: payment.member_name, phone: payment.member_phone }, payment),
        gymId: payment.gym_id,
        memberId: payment.member_id,
      });
      await updatePayment(id, { whatsapp_sent: true });
      setPayment(prev => ({ ...prev, whatsapp_sent: true }));
      showToast('WhatsApp receipt sent!', 'success');
    } catch (err) {
      showToast('Failed to send WhatsApp', 'error');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePayment(id);
      showToast('Payment deleted', 'success');
      navigate('/owner/payments', { replace: true });
    } catch (err) {
      showToast('Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="screen payment-detail-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="screen payment-detail-screen">
        <div className="screen-content">
          <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
          <div className="payment-empty">
            <h3>Payment not found</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen payment-detail-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>
            ← Back
          </button>
          <h1 className="top-bar-title" style={{ fontSize: 16 }}>
            #{payment.invoice_number}
          </h1>
          <div style={{ width: 60 }} />
        </div>

        {/* Invoice preview card */}
        <div className="invoice-preview-card glass-card">
          <div className="invoice-preview-number">INVOICE</div>
          <div className="invoice-preview-amount">₹{(payment.final_amount || 0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            {payment.member_name}
          </div>
          <div className="invoice-preview-status">
            <span className={`payment-status-badge ${payment.status}`} style={{ fontSize: 12 }}>
              {payment.status === 'paid' ? '✓ Paid' : payment.status === 'pending' ? '⏱ Pending' : '◐ Partial'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="action-buttons-row">
          <button className="action-btn primary glass-card" onClick={handleDownload}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Download
          </button>
          <button className="action-btn success glass-card" onClick={handleSendWhatsApp}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            WhatsApp
          </button>
          <button className="action-btn danger glass-card" onClick={() => setShowDeleteConfirm(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete
          </button>
        </div>

        {/* Payment info */}
        <div className="payment-info-section glass-card">
          <div className="payment-info-row">
            <span className="payment-info-label">Member</span>
            <span className="payment-info-value" style={{ cursor: 'pointer', color: 'var(--primary)' }}
              onClick={() => navigate(`/owner/members/${payment.member_id}`)}>
              {payment.member_name}
            </span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Phone</span>
            <span className="payment-info-value">{payment.member_phone}</span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Plan</span>
            <span className="payment-info-value">{payment.plan_name}</span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Amount</span>
            <span className="payment-info-value">₹{payment.amount}</span>
          </div>
          {payment.discount > 0 && (
            <div className="payment-info-row">
              <span className="payment-info-label">Discount</span>
              <span className="payment-info-value" style={{ color: '#1D9E75' }}>- ₹{payment.discount}</span>
            </div>
          )}
          <div className="payment-info-row">
            <span className="payment-info-label">Final amount</span>
            <span className="payment-info-value" style={{ fontWeight: 600 }}>₹{payment.final_amount}</span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Method</span>
            <span className="payment-info-value">
              {payment.method === 'cash' ? 'Cash 💵' : payment.method === 'upi' ? 'UPI 📱' : 'Razorpay 💳'}
              {payment.upi_ref && ` • ${payment.upi_ref}`}
            </span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Payment date</span>
            <span className="payment-info-value">{formatDate(payment.payment_date)}</span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">Membership</span>
            <span className="payment-info-value">
              {formatDate(payment.membership_start)} → {formatDate(payment.membership_end)}
            </span>
          </div>
          <div className="payment-info-row">
            <span className="payment-info-label">WhatsApp sent</span>
            <span className="payment-info-value">{payment.whatsapp_sent ? '✓ Yes' : '✗ No'}</span>
          </div>
          {payment.notes && (
            <div className="payment-info-row">
              <span className="payment-info-label">Notes</span>
              <span className="payment-info-value">{payment.notes}</span>
            </div>
          )}
          {/* Pending amount */}
          {(payment.status === 'pending' || payment.status === 'partial') && (
            <div className="payment-info-row" style={{ background: 'rgba(239,159,39,0.06)', borderRadius: 8, padding: '8px 4px' }}>
              <span className="payment-info-label" style={{ color: '#EF9F27', fontWeight: 600 }}>Pending amount</span>
              <span className="payment-info-value" style={{ color: '#EF9F27', fontWeight: 700 }}>₹{payment.pending_amount || payment.final_amount}</span>
            </div>
          )}
        </div>

        {/* Screenshot from member */}
        {payment.screenshot_url && (
          <div className="payment-info-section glass-card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>📱 UPI Screenshot</span>
              <a href={payment.screenshot_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: 'var(--primary)' }}>Open full →</a>
            </div>
            <img
              src={payment.screenshot_url}
              alt="UPI Screenshot"
              style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 300 }}
            />
            {(payment.status === 'pending' || payment.status === 'partial') && (
              <button
                className="btn-primary"
                style={{ marginTop: 12, background: '#1D9E75' }}
                onClick={async () => {
                  try {
                    await updatePayment(id, { status: 'paid', pending_amount: 0, paid_amount: payment.final_amount });
                    setPayment(prev => ({ ...prev, status: 'paid', pending_amount: 0 }));
                    showToast('Payment marked as paid!', 'success');
                  } catch (e) {
                    showToast('Failed to clear due', 'error');
                  }
                }}
              >
                ✓ Verify & Clear Due
              </button>
            )}
          </div>
        )}

        {/* Clear due without screenshot */}
        {!payment.screenshot_url && (payment.status === 'pending' || payment.status === 'partial') && (
          <button
            className="btn-primary"
            style={{ background: '#1D9E75', marginTop: 12 }}
            onClick={async () => {
              try {
                await updatePayment(id, { status: 'paid', pending_amount: 0, paid_amount: payment.final_amount });
                setPayment(prev => ({ ...prev, status: 'paid', pending_amount: 0 }));
                showToast('Due cleared!', 'success');
              } catch (e) {
                showToast('Failed to clear due', 'error');
              }
            }}
          >
            ✓ Clear Due
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bottom-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title" style={{ color: 'var(--error)' }}>Delete payment?</h2>
            <p className="sheet-subtitle">This cannot be undone. Invoice #{payment.invoice_number} will be deleted.</p>
            <button className="btn-primary" style={{ background: 'var(--error)', marginBottom: 10 }}
              onClick={handleDelete} disabled={deleting}>
              {deleting ? <div className="spinner" /> : 'Delete permanently'}
            </button>
            <button className="btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentDetail;
