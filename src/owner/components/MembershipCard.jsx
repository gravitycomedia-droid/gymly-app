import { QRCodeSVG } from 'qrcode.react';
import { getInitials, formatDate } from '../../utils/helpers';
import { getAvatarColor } from '../lib/avatarColor';

// Visual card only — ported from the dark-gradient card markup that already
// lives in src/pages/Members/MemberProfile.jsx (drives the same card_settings
// toggles from the gym doc). Canvas download / WhatsApp-share stays with the
// screen that owns the hidden QR canvas ref (owner/screens/Members/MemberProfile.jsx).
export default function MembershipCard({ member, gym, cardSettings: cs, statusColor: sc, statusLabel, planName, publicUrl }) {
  const avatarColor = getAvatarColor(member.name);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
        borderRadius: 20, padding: 20, position: 'relative', overflow: 'hidden', margin: '0 auto',
      }}
    >
      <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(108,99,199,0.3)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(62,124,177,0.25)', filter: 'blur(25px)' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            {cs.show_gym_name && <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{gym?.name || 'My Gym'}</div>}
            {cs.show_gymly_label !== false && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>GYMLY MEMBER CARD</div>}
          </div>
          {cs.show_status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '4px 10px', borderRadius: 99 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color }}>{statusLabel}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {cs.show_photo && (
            <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden', background: `linear-gradient(135deg, ${avatarColor}, #3E7CB1)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {member.profile_photo
                ? <img src={member.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{getInitials(member.name)}</span>}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {cs.show_member_name && <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</div>}
            {cs.show_plan && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{planName}</div>}
            {cs.show_member_id && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>#{member.memberNumber || `MEM-${member.id.substring(0, 6)}`}</div>}
            {cs.show_enrollment_id && member.latestEnrollmentNumber && (
              <div style={{ display: 'inline-block', marginTop: 6, fontSize: 15, fontWeight: 800, color: '#7BE3AE', background: 'rgba(123,227,174,0.15)', padding: '4px 12px', borderRadius: 8, fontFamily: 'monospace', letterSpacing: 0.5, border: '1px solid rgba(123,227,174,0.3)' }}>
                {member.latestEnrollmentNumber}
              </div>
            )}
          </div>
          {cs.show_qr && (
            <div style={{ background: '#fff', padding: 6, borderRadius: 10, flexShrink: 0 }}>
              <QRCodeSVG value={publicUrl} size={52} bgColor="transparent" fgColor="#1A1A1A" level="M" />
            </div>
          )}
        </div>

        {(cs.show_expiry || cs.show_phone) && (
          <div style={{ display: 'flex', gap: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
            {cs.show_expiry && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valid till</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{member.subscription_expiry ? formatDate(member.subscription_expiry) : 'N/A'}</div>
              </div>
            )}
            {cs.show_phone && member.phone && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{member.phone}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
