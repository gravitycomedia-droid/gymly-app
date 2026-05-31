import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMemberPaymentsRealtime } from '../../firebase/firestore-payments';
import { formatDate } from '../../utils/helpers';
import { jsPDF } from 'jspdf';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '../../context/ToastContext';
import '../MemberProfile/MemberProfile.css';

const MemberPayments = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);

  useEffect(() => {
    if (!user?.uid || !userDoc?.gym_id) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, user.uid, (data) => {
      setPayments(data);
    });
    return () => unsub();
  }, [user?.uid, userDoc?.gym_id]);

  const handleDownloadReceipt = async (payment) => {
    // If the official Zoho Invoice PDF exists, open it directly
    if (payment.invoice_pdf_url) {
      window.open(payment.invoice_pdf_url, '_blank');
      return;
    }
    
    // Fallback logic for legacy payments without Zoho integration: Generate on-demand
    showToast('Generating official invoice... please wait', 'success');
    try {
      const functions = getFunctions();
      const generateInvoice = httpsCallable(functions, 'generateInvoice');
      const result = await generateInvoice({ paymentId: payment.id });
      
      if (result.data?.pdf_url) {
        window.open(result.data.pdf_url, '_blank');
      }
    } catch (err) {
      console.error('Invoice generation failed:', err);
      showToast('PDF not available right now. Please tell your gym owner.', 'error');
    }
  };


  return (
    <div className="screen member-profile-screen">
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Payment History</h1>
          <div style={{ width: 60 }} />
        </div>

        <div className="profile-details glass-card" style={{ padding: '20px', marginTop: 16 }}>
          {payments.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments recorded yet.</p>
          ) : (
            payments.map(p => {
              const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
              return (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedPayment(p)}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.plan_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDate(d)} · {p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'}
                      · #{p.invoice_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8,
                      background: p.status === 'paid' ? 'rgba(29,158,117,0.1)' : p.status === 'partial' ? 'rgba(239,159,39,0.1)' : 'rgba(186, 26, 26, 0.15)',
                      color: p.status === 'paid' ? '#1D9E75' : p.status === 'partial' ? '#EF9F27' : 'var(--error)',
                    }}>
                      {p.status === 'paid' ? 'Paid' : p.status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Payment Details Modal */}
        {selectedPayment && (
          <div className="modal-overlay" onClick={() => setSelectedPayment(null)} style={{ zIndex: 1000 }}>
            <div className="glass-card" onClick={e => e.stopPropagation()} style={{
              width: '90%', maxWidth: 400, padding: 24, borderRadius: 20, position: 'relative'
            }}>
              <button 
                onClick={() => setSelectedPayment(null)}
                style={{
                  position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', 
                  fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)'
                }}
              >
                ×
              </button>
              
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
                Payment Details
              </h3>

              <div style={{ background: 'rgba(0,0,0,0.02)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Status</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                    background: selectedPayment.status === 'paid' ? 'rgba(29,158,117,0.1)' : selectedPayment.status === 'partial' ? 'rgba(239,159,39,0.1)' : 'rgba(186, 26, 26, 0.15)',
                    color: selectedPayment.status === 'paid' ? '#1D9E75' : selectedPayment.status === 'partial' ? '#EF9F27' : 'var(--error)',
                  }}>
                    {selectedPayment.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Invoice #</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedPayment.invoice_number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Plan</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedPayment.plan_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Date</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(selectedPayment.payment_date?.toDate ? selectedPayment.payment_date.toDate() : new Date(selectedPayment.payment_date))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Method</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedPayment.method.toUpperCase()}</span>
                </div>
                {selectedPayment.upi_ref && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>UPI Ref</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedPayment.upi_ref}</span>
                  </div>
                )}
                <hr style={{ border: 'none', borderTop: '1px dashed rgba(0,0,0,0.1)', margin: '16px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Net Amount</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>₹{selectedPayment.amount}</span>
                </div>
                {selectedPayment.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--error)', fontSize: 13 }}>Discount</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--error)' }}>- ₹{selectedPayment.discount}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Total Paid</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>₹{selectedPayment.paid_amount || selectedPayment.final_amount}</span>
                </div>
              </div>

              <button 
                onClick={() => handleDownloadReceipt(selectedPayment)}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                <span>📄</span> Download Receipt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberPayments;
