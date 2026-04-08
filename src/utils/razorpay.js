/**
 * Razorpay payment scaffold (test mode).
 * Wire to live keys when owner has business account.
 */
export async function initiateRazorpayPayment({
  amount,         // in paise (₹999 = 99900)
  memberName,
  memberPhone,
  gymName,
  planName,
  onSuccess,
  onFailure
}) {
  return new Promise((resolve, reject) => {
    // Load Razorpay script dynamically
    const existing = document.querySelector('script[src*="razorpay"]');
    if (existing) {
      openCheckout();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => openCheckout();
    script.onerror = () => {
      onFailure?.('Failed to load Razorpay');
      reject(new Error('Failed to load Razorpay'));
    };

    function openCheckout() {
      const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) {
        onFailure?.('Razorpay key not configured');
        reject(new Error('Razorpay key not configured'));
        return;
      }

      const options = {
        key: key,
        amount: amount,
        currency: 'INR',
        name: gymName || 'Gymly',
        description: `${planName || 'Membership'} Payment`,
        prefill: {
          name: memberName || '',
          contact: memberPhone || '',
        },
        theme: { color: '#534AB7' },
        handler: async (response) => {
          const result = {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            method: 'razorpay',
          };
          onSuccess?.(result);
          resolve(result);
        },
        modal: {
          ondismiss: () => {
            onFailure?.('dismissed');
            resolve(null);
          },
        },
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (err) {
        onFailure?.(err.message);
        reject(err);
      }
    }
  });
}
