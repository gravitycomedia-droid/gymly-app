import { jsPDF } from 'jspdf';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Generate an A5 PDF invoice.
 * Returns a Blob for Firebase Storage upload.
 */
export async function generateInvoicePDF(payment, gym, member) {
  const doc = new jsPDF({ format: 'a5', unit: 'mm' });

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 148, 210, 'F');

  // Header band — purple
  doc.setFillColor(83, 74, 183);
  doc.rect(0, 0, 148, 35, 'F');

  // Gym name (white, centered)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(gym?.name || 'Gym', 74, 15, { align: 'center' });

  // "INVOICE" label
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('MEMBERSHIP INVOICE', 74, 22, { align: 'center' });

  // Invoice number + date (top right)
  doc.setFontSize(8);
  doc.text(`#${payment.invoice_number}`, 140, 12, { align: 'right' });
  doc.text(fmtDate(payment.payment_date), 140, 18, { align: 'right' });

  // Member info section
  doc.setTextColor(26, 26, 46);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('BILLED TO', 10, 44);
  doc.setFont('helvetica', 'normal');
  doc.text(member?.name || 'Member', 10, 50);
  doc.text(member?.phone || '', 10, 55);
  doc.text(`Member ID: ${(member?.id || '').slice(0, 8).toUpperCase()}`, 10, 60);

  // Gym info (right side)
  doc.setFont('helvetica', 'bold');
  doc.text('FROM', 100, 44);
  doc.setFont('helvetica', 'normal');
  doc.text(gym?.name || 'Gym', 100, 50);
  doc.text(gym?.city || '', 100, 55);
  doc.text(gym?.phone || '', 100, 60);

  // Divider
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.3);
  doc.line(10, 65, 138, 65);

  // Table header
  doc.setFillColor(238, 237, 254);
  doc.rect(10, 68, 128, 8, 'F');
  doc.setTextColor(83, 74, 183);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', 14, 74);
  doc.text('DURATION', 80, 74);
  doc.text('AMOUNT', 134, 74, { align: 'right' });

  // Table row
  doc.setTextColor(26, 26, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(payment.plan_name || 'Membership', 14, 84);

  const startStr = fmtDate(payment.membership_start);
  const endStr = fmtDate(payment.membership_end);
  doc.text(`${startStr} → ${endStr}`, 80, 84);
  doc.text(`₹${payment.amount}`, 134, 84, { align: 'right' });

  // Divider
  doc.line(10, 90, 138, 90);

  // Discount
  let yPos = 97;
  if (payment.discount > 0) {
    doc.setTextColor(83, 74, 183);
    doc.text('Discount:', 100, yPos);
    doc.text(`- ₹${payment.discount}`, 134, yPos, { align: 'right' });
    yPos += 5;
  }

  // Total box
  doc.setFillColor(83, 74, 183);
  doc.roundedRect(90, yPos, 48, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', 94, yPos + 9);
  doc.text(`₹${payment.final_amount}`, 134, yPos + 9, { align: 'right' });

  // Payment method
  doc.setTextColor(100, 100, 120);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Payment method: ${(payment.method || '').toUpperCase()}`, 10, yPos + 20);
  if (payment.upi_ref) {
    doc.text(`UPI Ref: ${payment.upi_ref}`, 10, yPos + 26);
  }

  // Gym address
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 140);
  if (gym?.address) {
    doc.text(gym.address, 74, 138, { align: 'center' });
  }
  if (gym?.working_hours) {
    doc.text(`Hours: ${gym.working_hours.open || '6 AM'} – ${gym.working_hours.close || '10 PM'}`, 74, 143, { align: 'center' });
  }

  // Footer band
  doc.setFillColor(238, 237, 254);
  doc.rect(0, 198, 148, 12, 'F');
  doc.setTextColor(83, 74, 183);
  doc.setFontSize(7);
  doc.text('Thank you for being a member! Powered by Gymly', 74, 205, { align: 'center' });

  return doc.output('blob');
}

/**
 * Upload invoice blob to Firebase Storage.
 */
export async function uploadInvoice(gymId, invoiceNumber, blob) {
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const { storage } = await import('../firebase/config');

  const storageRef = ref(storage, `gyms/${gymId}/invoices/${invoiceNumber}.pdf`);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return url;
}
