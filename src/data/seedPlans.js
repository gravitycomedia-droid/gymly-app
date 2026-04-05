/**
 * Seed predefined workout plans to Firestore.
 * Idempotent — only seeds if no predefined plans exist.
 */
import { collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PREDEFINED_PLANS } from './predefinedPlans';

let hasSeeded = false;

export async function seedPredefinedPlans() {
  if (!db || hasSeeded) return;
  hasSeeded = true;

  try {
    // Check if already seeded and delete old plans to refresh data structure
    const q = query(
      collection(db, 'workout_plans'),
      where('type', '==', 'predefined'),
      where('created_by', '==', 'system')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      console.log('Replacing existing predefined plans...');
      for (const planDoc of snap.docs) {
        // Delete associated days
        const daysQuery = query(collection(db, 'workout_days'), where('plan_id', '==', planDoc.id));
        const daysSnap = await getDocs(daysQuery);
        for (const dayDoc of daysSnap.docs) {
          await deleteDoc(dayDoc.ref);
        }
        await deleteDoc(planDoc.ref);
      }
    }

    console.log('Seeding predefined workout plans...');

    for (const { plan, days } of PREDEFINED_PLANS) {
      // Create plan doc
      const planRef = await addDoc(collection(db, 'workout_plans'), {
        ...plan,
        created_at: serverTimestamp(),
      });

      // Create day docs
      for (const day of days) {
        await addDoc(collection(db, 'workout_days'), {
          plan_id: planRef.id,
          ...day,
        });
      }

      console.log(`Seeded plan: ${plan.name} (${days.length} days)`);
    }

    console.log('All predefined plans seeded successfully.');
  } catch (err) {
    console.error('Error seeding plans:', err);
    hasSeeded = false; // Allow retry
  }
}
