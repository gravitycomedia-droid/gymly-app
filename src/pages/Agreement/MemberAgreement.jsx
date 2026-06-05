import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getGym } from '../../firebase/firestore';
import { formatDate } from '../../utils/helpers';
import './MemberAgreement.css';

const MemberAgreement = () => {
  const navigate = useNavigate();
  const { user, userDoc, refreshUserDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef(null);
  const lastPointRef = useRef(null);

  useEffect(() => {
    if (userDoc?.gym_id) {
      getGym(userDoc.gym_id).then(setGym);
    }
  }, [userDoc?.gym_id]);

  // Setup canvas for DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPointRef.current = pos;
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
  };

  const endDraw = (e) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const generateAgreementPDF = async (signatureDataUrl) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Header gradient simulation
    pdf.setFillColor(83, 74, 183);
    pdf.rect(0, 0, pageWidth, 40, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text('GYMLY', 20, 18);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Membership Agreement', 20, 28);
    pdf.text(`${gym?.name || 'Gym'}`, pageWidth - 20, 28, { align: 'right' });

    // Agreement ID & Date
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(9);
    pdf.text(`Agreement Date: ${formatDate(new Date())}`, 20, 50);
    pdf.text(`Member ID: ${user?.uid?.slice(0, 12)}...`, 20, 56);

    // Member info section
    pdf.setFillColor(245, 247, 255);
    pdf.rect(15, 62, pageWidth - 30, 28, 'F');
    pdf.setTextColor(30, 30, 50);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Member Details', 20, 72);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Name: ${userDoc?.name || '—'}`, 20, 80);
    pdf.text(`Phone: ${userDoc?.phone || '—'}`, 20, 86);
    pdf.text(`Plan: ${userDoc?.plan_name || '—'}`, pageWidth / 2, 80);
    pdf.text(`Gym: ${gym?.name || '—'}`, pageWidth / 2, 86);

    // Terms
    pdf.setTextColor(30, 30, 50);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Terms & Conditions', 20, 102);
    pdf.setDrawColor(83, 74, 183);
    pdf.line(20, 104, pageWidth - 20, 104);

    const terms = [
      '1. MEMBERSHIP: This agreement grants the member access to gym facilities as per the selected plan.',
      '2. PAYMENT: Membership fees are non-refundable. Renewal must be completed before expiry.',
      '3. CODE OF CONDUCT: Members must maintain respectful behaviour and follow gym rules at all times.',
      '4. HEALTH DISCLAIMER: Members must disclose medical conditions and exercise at their own risk.',
      '5. PERSONAL BELONGINGS: The gym is not responsible for theft or loss of personal property.',
      '6. EQUIPMENT USAGE: Improper use of equipment may result in immediate membership termination.',
      '7. PHOTOGRAPHY: Members must not photograph other members without explicit consent.',
      '8. MEMBERSHIP FREEZE: Freezing membership is subject to gym policy and advance notice.',
      '9. TERMINATION: The gym reserves the right to terminate membership for violation of rules.',
      '10. AMENDMENTS: The gym reserves the right to amend terms with 30 days prior notice.',
      '11. GOVERNING LAW: This agreement is governed by the applicable laws of India.',
      '12. DIGITAL AGREEMENT: This digitally signed agreement is legally binding.',
    ];

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(60, 60, 80);
    let yPos = 112;
    terms.forEach((term) => {
      const lines = pdf.splitTextToSize(term, pageWidth - 40);
      pdf.text(lines, 20, yPos);
      yPos += lines.length * 5.5 + 2;
    });

    // Signature section
    yPos += 8;
    pdf.setFillColor(245, 247, 255);
    pdf.rect(15, yPos, pageWidth - 30, 50, 'F');
    pdf.setTextColor(83, 74, 183);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Digital Signature', 20, yPos + 10);
    pdf.setTextColor(60, 60, 80);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Signed by: ${userDoc?.name || '—'}`, 20, yPos + 18);
    pdf.text(`Date & Time: ${new Date().toLocaleString('en-IN')}`, 20, yPos + 24);

    // Embed signature image
    if (signatureDataUrl) {
      pdf.addImage(signatureDataUrl, 'PNG', 20, yPos + 28, 80, 16);
    }

    // Footer
    pdf.setDrawColor(83, 74, 183);
    pdf.line(15, yPos + 48, pageWidth - 15, yPos + 48);
    pdf.setFontSize(8);
    pdf.setTextColor(130, 130, 150);
    pdf.text('This is a digitally signed agreement generated by Gymly.', pageWidth / 2, yPos + 54, { align: 'center' });
    pdf.text(`Generated on ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, yPos + 59, { align: 'center' });

    return pdf.output('blob');
  };

  const handleAgree = async () => {
    if (!hasDrawn) {
      showToast('Please sign the agreement first', 'error');
      return;
    }
    if (!agreed) {
      showToast('Please check the confirmation box', 'error');
      return;
    }

    setLoading(true);
    try {
      const canvas = canvasRef.current;
      const signatureDataUrl = canvas.toDataURL('image/png');

      // Generate PDF
      const pdfBlob = await generateAgreementPDF(signatureDataUrl);

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const storageRef = ref(storage, `agreements/${userDoc.gym_id}/${user.uid}_${timestamp}.pdf`);
      await uploadBytes(storageRef, pdfBlob);
      const downloadUrl = await getDownloadURL(storageRef);

      // Update member doc
      await updateDoc(doc(db, 'users', user.uid), {
        agreement_status: 'agreed',
        agreement_signed_at: new Date().toISOString(),
        agreement_url: downloadUrl,
      });

      // Update lead doc if exists
      if (userDoc.source_lead_id) {
        try {
          await updateDoc(doc(db, 'leads', userDoc.source_lead_id), {
            agreement_status: 'agreed',
            agreement_url: downloadUrl,
          });
        } catch (leadErr) {
          console.error('Lead agreement update failed (non-critical):', leadErr);
        }
      } else {
        // Try to find the lead by phone
        try {
          const leadsQ = query(
            collection(db, 'leads'),
            where('phone', '==', userDoc.phone),
            where('gym_id', '==', userDoc.gym_id)
          );
          const leadsSnap = await getDocs(leadsQ);
          for (const leadDoc of leadsSnap.docs) {
            await updateDoc(leadDoc.ref, {
              agreement_status: 'agreed',
              agreement_url: downloadUrl,
            });
          }
        } catch (e) { /* non-critical */ }
      }

      await refreshUserDoc(user.uid);
      showToast('Agreement signed successfully! 🎉', 'success');
      navigate('/member/home', { replace: true });
    } catch (err) {
      console.error('Agreement error:', err);
      showToast('Failed to save agreement: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agreement-screen">
      <div className="agreement-content">
        {/* Header */}
        <div className="agreement-header">
          <div className="agreement-header-logo">
            <span className="agreement-gymly-brand">Gymly</span>
          </div>
          <h1 className="agreement-title">Membership Agreement</h1>
          <p className="agreement-subtitle">
            Welcome to {gym?.name || 'your gym'}! Please review and sign the agreement below to activate your membership.
          </p>
        </div>

        {/* Member info card */}
        <div className="agreement-member-card glass-card">
          <div className="agreement-member-row">
            <span className="agreement-member-label">Member</span>
            <span className="agreement-member-value">{userDoc?.name}</span>
          </div>
          <div className="agreement-member-row">
            <span className="agreement-member-label">Phone</span>
            <span className="agreement-member-value">{userDoc?.phone}</span>
          </div>
          <div className="agreement-member-row">
            <span className="agreement-member-label">Gym</span>
            <span className="agreement-member-value">{gym?.name}</span>
          </div>
          <div className="agreement-member-row">
            <span className="agreement-member-label">Plan</span>
            <span className="agreement-member-value" style={{ color: 'var(--primary)', fontWeight: 700 }}>{userDoc?.plan_name || 'Membership'}</span>
          </div>
          <div className="agreement-member-row">
            <span className="agreement-member-label">Date</span>
            <span className="agreement-member-value">{formatDate(new Date())}</span>
          </div>
        </div>

        {/* Terms */}
        <div className="agreement-terms-card glass-card">
          <h2 className="agreement-terms-title">📋 Terms & Conditions</h2>
          <div className="agreement-terms-body">
            <ol className="agreement-terms-list">
              <li><strong>Membership:</strong> This agreement grants access to {gym?.name || 'gym'} facilities as per the selected plan. Membership is personal and non-transferable.</li>
              <li><strong>Payment:</strong> Membership fees are non-refundable. Renewal must be completed before expiry to maintain uninterrupted access.</li>
              <li><strong>Code of Conduct:</strong> Members must maintain respectful behaviour, appropriate attire, and follow all posted gym rules at all times.</li>
              <li><strong>Health Disclaimer:</strong> Members must disclose relevant medical conditions before starting any exercise program. Exercise is at the member's own risk.</li>
              <li><strong>Personal Belongings:</strong> The gym management is not responsible for theft, loss, or damage to personal property on the premises.</li>
              <li><strong>Equipment Usage:</strong> Equipment must be used properly. Improper use or damage may result in immediate membership termination without refund.</li>
              <li><strong>Photography:</strong> Members must not photograph or video other members without their explicit consent.</li>
              <li><strong>Membership Freeze:</strong> Temporary freeze may be permitted subject to gym policy and requires advance written notice.</li>
              <li><strong>Termination:</strong> The management reserves the right to terminate membership for violation of rules without refund.</li>
              <li><strong>Amendments:</strong> The gym reserves the right to modify terms with 30 days' prior notice to members.</li>
              <li><strong>Governing Law:</strong> This agreement is governed by the applicable laws of India.</li>
              <li><strong>Digital Agreement:</strong> By signing below, you confirm you have read, understood, and agree to all terms. This digitally signed document is legally binding.</li>
            </ol>
          </div>
        </div>

        {/* Signature Pad */}
        <div className="agreement-signature-card glass-card">
          <div className="agreement-sig-header">
            <h2 className="agreement-sig-title">✍️ Draw Your Signature</h2>
            <button className="agreement-sig-clear" onClick={clearSignature}>Clear</button>
          </div>
          <p className="agreement-sig-hint">Sign with your finger or mouse in the box below</p>
          <div className="agreement-sig-box">
            <canvas
              ref={canvasRef}
              className="agreement-sig-canvas"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasDrawn && (
              <div className="agreement-sig-placeholder">
                <span>Sign here</span>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation checkbox */}
        <label className="agreement-checkbox-label">
          <input
            type="checkbox"
            className="agreement-checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I, <strong>{userDoc?.name}</strong>, have read and agree to all the terms and conditions of{' '}
            <strong>{gym?.name || 'this gym'}</strong>'s membership agreement. I understand this is a legally binding document.
          </span>
        </label>

        {/* Submit button */}
        <button
          className="agreement-submit-btn"
          onClick={handleAgree}
          disabled={loading}
          id="sign-agreement-btn"
        >
          {loading ? (
            <div style={{
              width: 22, height: 22, border: '2.5px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
            }} />
          ) : (
            '✅ Sign & Activate Membership'
          )}
        </button>

        <p className="agreement-footer-note">
          🔒 Your signature is encrypted and stored securely. A PDF copy will be generated automatically.
        </p>
      </div>
    </div>
  );
};

export default MemberAgreement;
