// src/firebase/mockFirestore.js
// Mock Firestore functions for taking automated screenshots without talking to Firebase

const now = new Date();
const d = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
};

// Helper to simulate Firestore Timestamp
const mockTimestamp = (date) => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0
});

export const mockGym = {
  id: 'mock_gym_123',
  name: 'Iron Temple Fitness',
  city: 'Mumbai',
  address: 'Andheri West, Link Road',
  phone: '9876543210',
  description: 'Premier fitness facility with top-tier trainers, high-end equipment, and custom training programs.',
  settings: {
    plans: [
      { id: 'plan1', name: 'Bronze Plan', price: 1500, duration_days: 30, is_active: true, color: '#C084FC' },
      { id: 'plan2', name: 'Silver Plan', price: 3500, duration_days: 90, is_active: true, color: '#38BDF8' },
      { id: 'plan3', name: 'Gold Plan', price: 12000, duration_days: 365, is_active: true, color: '#FBBF24' },
      { id: 'plan4', name: 'Platinum Plan', price: 6000, duration_days: 30, is_active: true, color: '#34D399', description: 'Personal Training + Diet Plan Included' }
    ]
  },
  equipment: [
    { id: 'eq1', name: 'Treadmills (Commercial)', photo: '', muscles: ['Cardio', 'Legs'] },
    { id: 'eq2', name: 'Smith Machine', photo: '', muscles: ['Chest', 'Shoulders', 'Triceps'] },
    { id: 'eq3', name: 'Power Racks', photo: '', muscles: ['Back', 'Quads', 'Full Body'] },
    { id: 'eq4', name: 'Dumbbell Set (2.5kg - 50kg)', photo: '', muscles: ['Full Body'] },
    { id: 'eq5', name: 'Leg Press Machine', photo: '', muscles: ['Quads', 'Hamstrings', 'Glutes'] }
  ]
};

export const mockMembers = [
  {
    id: 'm1',
    name: 'Rohan Sharma',
    phone: '9820012345',
    plan_id: 'plan4',
    plan_name: 'Platinum Plan',
    role: 'member',
    gym_id: 'mock_gym_123',
    subscription_expiry: mockTimestamp(d(25)), // 25 days left (Active)
    created_at: mockTimestamp(d(-40)),
    agreement_status: 'agreed',
    agreement_url: 'http://example.com/agreement.pdf',
    attendance_count: 24,
    last_seen: mockTimestamp(d(-1))
  },
  {
    id: 'm2',
    name: 'Priya Patel',
    phone: '9819988776',
    plan_id: 'plan3',
    plan_name: 'Gold Plan',
    role: 'member',
    gym_id: 'mock_gym_123',
    subscription_expiry: mockTimestamp(d(4)), // 4 days left (Expiring)
    created_at: mockTimestamp(d(-100)),
    agreement_status: 'agreed',
    attendance_count: 78,
    last_seen: mockTimestamp(d(0))
  },
  {
    id: 'm3',
    name: 'Amit Verma',
    phone: '9769011223',
    plan_id: 'plan1',
    plan_name: 'Bronze Plan',
    role: 'member',
    gym_id: 'mock_gym_123',
    subscription_expiry: mockTimestamp(d(-3)), // Expired 3 days ago
    created_at: mockTimestamp(d(-33)),
    agreement_status: 'agreed',
    attendance_count: 15,
    last_seen: mockTimestamp(d(-4))
  },
  {
    id: 'm4',
    name: 'Vikram Malhotra',
    phone: '9892099887',
    plan_id: 'plan2',
    plan_name: 'Silver Plan',
    role: 'member',
    gym_id: 'mock_gym_123',
    subscription_expiry: mockTimestamp(d(65)), // Active
    created_at: mockTimestamp(d(-25)),
    agreement_status: 'pending',
    attendance_count: 12,
    last_seen: mockTimestamp(d(-2))
  },
  {
    id: 'm5',
    name: 'Neha Gupta',
    phone: '9821122334',
    plan_id: 'plan4',
    plan_name: 'Platinum Plan',
    role: 'member',
    gym_id: 'mock_gym_123',
    subscription_expiry: mockTimestamp(d(12)), // Active
    created_at: mockTimestamp(d(-18)),
    agreement_status: 'agreed',
    attendance_count: 8,
    last_seen: mockTimestamp(d(0))
  }
];

export const mockStaff = [
  { id: 's1', name: 'Coach Vicky', role: 'trainer', gym_id: 'mock_gym_123', email: 'vicky@irontemple.com', created_at: mockTimestamp(d(-150)) },
  { id: 's2', name: 'Sarah receptionist', role: 'receptionist', gym_id: 'mock_gym_123', email: 'sarah@irontemple.com', created_at: mockTimestamp(d(-90)) },
  { id: 's3', name: 'Rahul Manager', role: 'manager', gym_id: 'mock_gym_123', email: 'rahul@irontemple.com', created_at: mockTimestamp(d(-200)) }
];

export const mockPayments = [
  {
    id: 'pay1',
    member_name: 'Rohan Sharma',
    member_id: 'm1',
    plan_name: 'Platinum Plan',
    plan_id: 'plan4',
    amount: 6000,
    final_amount: 6000,
    paid_amount: 6000,
    pending_amount: 0,
    status: 'paid',
    method: 'upi',
    invoice_number: 'GYM-2026-0034',
    payment_date: mockTimestamp(d(-15)),
    gym_id: 'mock_gym_123'
  },
  {
    id: 'pay2',
    member_name: 'Priya Patel',
    member_id: 'm2',
    plan_name: 'Gold Plan',
    plan_id: 'plan3',
    amount: 12000,
    final_amount: 12000,
    paid_amount: 12000,
    pending_amount: 0,
    status: 'paid',
    method: 'card',
    invoice_number: 'GYM-2026-0031',
    payment_date: mockTimestamp(d(-100)),
    gym_id: 'mock_gym_123'
  },
  {
    id: 'pay3',
    member_name: 'Vikram Malhotra',
    member_id: 'm4',
    plan_name: 'Silver Plan',
    plan_id: 'plan2',
    amount: 3500,
    final_amount: 3500,
    paid_amount: 2000,
    pending_amount: 1500,
    status: 'partial',
    method: 'cash',
    invoice_number: 'GYM-2026-0038',
    payment_date: mockTimestamp(d(-25)),
    gym_id: 'mock_gym_123'
  },
  {
    id: 'pay4',
    member_name: 'Neha Gupta',
    member_id: 'm5',
    plan_name: 'Platinum Plan',
    plan_id: 'plan4',
    amount: 6000,
    final_amount: 6000,
    paid_amount: 0,
    pending_amount: 6000,
    status: 'pending',
    method: 'upi',
    invoice_number: 'GYM-2026-0041',
    payment_date: mockTimestamp(d(-18)),
    gym_id: 'mock_gym_123'
  }
];

export const mockLeads = [
  { id: 'lead1', gym_id: 'mock_gym_123', name: 'Kabir Khan', phone: '9988776655', email: 'kabir@gmail.com', plan_interest: 'Gold Plan', status: 'new', created_at: mockTimestamp(d(-1)) },
  { id: 'lead2', gym_id: 'mock_gym_123', name: 'Ananya Sen', phone: '9922114433', email: 'ananya@gmail.com', plan_interest: 'Platinum Plan', status: 'contacted', created_at: mockTimestamp(d(-4)) },
  { id: 'lead3', gym_id: 'mock_gym_123', name: 'Rajesh Koothrapali', phone: '9773123456', email: 'raj@outlook.com', plan_interest: 'Bronze Plan', status: 'joined', created_at: mockTimestamp(d(-10)) }
];

export const mockWhatsAppLogs = [
  { id: 'wa1', gym_id: 'mock_gym_123', member_id: 'm1', phone: '9820012345', message_type: 'welcome', status: 'delivered', message_preview: 'Welcome to Iron Temple Fitness! Hi Rohan Sharma, your membership is now active...', sent_at: mockTimestamp(d(-15)), retry_count: 0 },
  { id: 'wa2', gym_id: 'mock_gym_123', member_id: 'm2', phone: '9819988776', message_type: 'expiry_7d', status: 'delivered', message_preview: '⏰ Membership Reminder: Hi Priya, your membership expires in 7 days...', sent_at: mockTimestamp(d(-3)), retry_count: 0 },
  { id: 'wa3', gym_id: 'mock_gym_123', member_id: 'm3', phone: '9769011223', message_type: 'expiry_1d', status: 'failed', error_reason: 'Recipient phone number invalid', message_preview: '🚨 Last Day Reminder: Hi Amit, your membership expires TOMORROW...', sent_at: mockTimestamp(d(-4)), retry_count: 3 },
  { id: 'wa4', gym_id: 'mock_gym_123', member_id: 'm5', phone: '9821122334', message_type: 'payment_due', status: 'sent', message_preview: '💰 Payment Reminder: Hi Neha, your payment of ₹6000 is pending...', sent_at: mockTimestamp(d(-18)), retry_count: 0 }
];

// Generate mock attendance logs over the last 30 days for heatmap
export const mockAttendanceLogs = [];
const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
for (let i = 0; i < 30; i++) {
  const dateObj = d(-i);
  const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  
  // Random checkins for that day (mostly on Mon, Wed, Fri around 6-9 AM and 5-8 PM)
  const numCheckins = Math.floor(Math.random() * 8) + 3; // 3 to 10 entries per day
  for (let j = 0; j < numCheckins; j++) {
    // Generate check-in hour
    let hour = 6;
    if (Math.random() > 0.5) {
      hour = Math.floor(Math.random() * 4) + 6; // 6 AM to 9 AM
    } else {
      hour = Math.floor(Math.random() * 4) + 17; // 5 PM to 8 PM
    }
    const checkinTime = new Date(dateObj);
    checkinTime.setHours(hour, Math.floor(Math.random() * 60), 0);

    const mockMember = mockMembers[j % mockMembers.length];

    mockAttendanceLogs.push({
      id: `att_${i}_${j}`,
      gym_id: 'mock_gym_123',
      member_id: mockMember.id,
      member_name: mockMember.name,
      plan_name: mockMember.plan_name,
      is_expired: false,
      entry_time: mockTimestamp(checkinTime),
      date: dateKey,
      scanned_by: 'qr_self',
      scan_mode: 'phone'
    });
  }
}

// Workout plans
export const mockWorkoutPlans = [
  { id: 'wplan1', name: '4-Day Hypertrophy Split', type: 'custom', gym_id: 'mock_gym_123', created_by: 'trainer', is_active: true, description: 'Intermediate muscle building plan focusing on progressive overload.' },
  { id: 'wplan2', name: 'Fat Loss & Conditioning', type: 'predefined', gym_id: null, created_by: 'system', is_active: true, description: 'High intensity circuits mixed with steady state cardio.' }
];

export const mockWorkoutDays = [
  { id: 'wd1', plan_id: 'wplan1', day_number: 1, name: 'Day 1: Chest & Triceps', exercises: [
    { id: 'ex1', name: 'Incline Dumbbell Press', sets: 4, reps: '8-10', rest: 90, difficulty: 'Intermediate', equipment: 'Dumbbells', completed: true },
    { id: 'ex2', name: 'Flat Barbell Bench Press', sets: 3, reps: '6-8', rest: 120, difficulty: 'Intermediate', equipment: 'Barbell', completed: true },
    { id: 'ex3', name: 'Cable Chest Flyes', sets: 3, reps: '12-15', rest: 60, difficulty: 'Beginner', equipment: 'Cables', completed: false },
    { id: 'ex4', name: 'Overhead Cable Tricep Extension', sets: 3, reps: '10-12', rest: 60, difficulty: 'Beginner', equipment: 'Cables', completed: false }
  ]},
  { id: 'wd2', plan_id: 'wplan1', day_number: 2, name: 'Day 2: Back & Biceps', exercises: [
    { id: 'ex5', name: 'Lat Pulldowns', sets: 4, reps: '10-12', rest: 90, difficulty: 'Beginner', equipment: 'Cables' },
    { id: 'ex6', name: 'Bent Over Barbell Rows', sets: 3, reps: '8-10', rest: 90, difficulty: 'Intermediate', equipment: 'Barbell' },
    { id: 'ex7', name: 'Incline Dumbbell Bicep Curls', sets: 3, reps: '12', rest: 60, difficulty: 'Beginner', equipment: 'Dumbbells' }
  ]}
];

export const mockWorkoutLogs = [
  { id: 'log1', member_id: 'mock_member', plan_id: 'wplan1', day_number: 1, completed_count: 2, total_calories: 250, log_date: mockTimestamp(d(-1)), exercises: [
    { id: 'ex1', name: 'Incline Dumbbell Press', completed: true, weight: 24, reps: 10 },
    { id: 'ex2', name: 'Flat Barbell Bench Press', completed: true, weight: 60, reps: 8 }
  ]}
];

export const mockProgressLogs = [
  { id: 'p1', member_id: 'mock_member', weight: 78.5, body_fat: 18.2, muscle_mass: 36.2, chest: 102, waist: 86, biceps: 38, logged_at: mockTimestamp(d(-25)) },
  { id: 'p2', member_id: 'mock_member', weight: 77.8, body_fat: 17.5, muscle_mass: 36.5, chest: 102.5, waist: 84.5, biceps: 38.5, logged_at: mockTimestamp(d(-15)) },
  { id: 'p3', member_id: 'mock_member', weight: 77.2, body_fat: 16.8, muscle_mass: 36.8, chest: 103, waist: 83, biceps: 39, logged_at: mockTimestamp(d(-5)) }
];

export const mockPRs = {
  ex1: { exercise_id: 'ex1', exercise_name: 'Incline Dumbbell Press', best_weight: 26, best_reps: 10, best_volume: 260, achieved_at: mockTimestamp(d(-5)) },
  ex2: { exercise_id: 'ex2', exercise_name: 'Flat Barbell Bench Press', best_weight: 70, best_reps: 8, best_volume: 560, achieved_at: mockTimestamp(d(-15)) }
};

// --- Mock Firestore Implementation Functions ---

export const getGym = async (gymId) => mockGym;
export const getUser = async (uid) => {
  if (uid === 'mock_owner') return { id: 'mock_owner', name: 'John Gymly', role: 'owner', gym_id: 'mock_gym_123' };
  return { id: 'mock_member', name: 'Alex Mercer', role: 'member', gym_id: 'mock_gym_123', plan_name: 'Platinum Plan', subscription_expiry: mockTimestamp(d(15)) };
};
export const getGymMembers = async () => ({ members: mockMembers, lastDoc: null, hasMore: false });
export const getGymMembersRealtime = (gymId, cb) => { cb(mockMembers); return () => {}; };
export const getGymStaff = async () => mockStaff;
export const getTrainers = async () => mockStaff.filter(s => s.role === 'trainer');
export const getAssignedMembers = (gymId, trainerId, cb) => { cb(mockMembers.slice(0, 2)); return () => {}; };
export const getWorkoutPlans = async () => mockWorkoutPlans;
export const getWorkoutDays = async (planId) => mockWorkoutDays.filter(d => d.plan_id === planId);
export const getWorkoutDay = async (planId, dayNum) => mockWorkoutDays.find(d => d.plan_id === planId && d.day_number === parseInt(dayNum)) || null;
export const getMemberWorkoutLogs = async () => mockWorkoutLogs;
export const getMemberTodayLog = async () => null;
export const getMemberPRs = async () => mockPRs;
export const getRecentMuscleSoreness = async () => null;
export const getMemberProgressLogs = async () => mockProgressLogs;

export const getPaymentsRealtime = (gymId, cb) => { cb(mockPayments); return () => {}; };
export const getMemberPaymentsRealtime = (gymId, memberId, cb) => { cb(mockPayments.filter(p => p.member_id === memberId)); return () => {}; };
export const getAttendanceLogsRealtime = (gymId, date, cb) => { cb(mockAttendanceLogs.filter(a => a.date === date)); return () => {}; };
export const getTodayActiveMembers = (gymId, cb) => { cb(mockAttendanceLogs.filter(a => a.date === dateKeyToday())); return () => {}; };
export const getAttendanceRange = async () => mockAttendanceLogs;
export const getWhatsAppLogsRealtime = (gymId, cb) => { cb(mockWhatsAppLogs); return () => {}; };
export const getPaymentById = async (id) => mockPayments.find(p => p.id === id) || null;

const dateKeyToday = () => {
  const dObj = new Date();
  return `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
};
