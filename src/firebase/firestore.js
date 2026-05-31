// src/firebase/firestore.js
// Proxy wrapper to redirect queries to mockFirestore in demo/screenshot mode

import * as real from './firestore_real';
import * as mock from './mockFirestore';
export * from 'firebase/firestore';

const isMock = () => typeof window !== 'undefined' && localStorage.getItem('mockRole');

// Wrapper helper
const run = (fnName, realFn, ...args) => {
  if (isMock()) {
    if (mock[fnName]) {
      return mock[fnName](...args);
    }
    console.warn(`mockFirestore.${fnName} not found. Falling back to real.`);
  }
  return realFn(...args);
};

export const getUser = (...args) => run('getUser', real.getUser, ...args);
export const createUser = (...args) => run('createUser', real.createUser, ...args);
export const updateUser = (...args) => run('updateUser', real.updateUser, ...args);
export const deleteUser = (...args) => run('deleteUser', real.deleteUser, ...args);

export const createGym = (...args) => run('createGym', real.createGym, ...args);
export const getGym = (...args) => run('getGym', real.getGym, ...args);
export const updateGym = (...args) => run('updateGym', real.updateGym, ...args);

export const getGymMembers = (...args) => run('getGymMembers', real.getGymMembers, ...args);
export const getGymMembersRealtime = (...args) => run('getGymMembersRealtime', real.getGymMembersRealtime, ...args);
export const linkMemberAccount = (...args) => run('linkMemberAccount', real.linkMemberAccount, ...args);
export const createMember = (...args) => run('createMember', real.createMember, ...args);
export const updateMember = (...args) => run('updateMember', real.updateMember, ...args);
export const deleteMember = (...args) => run('deleteMember', real.deleteMember, ...args);
export const getMemberByPhone = (...args) => run('getMemberByPhone', real.getMemberByPhone, ...args);

export const getGymStaff = (...args) => run('getGymStaff', real.getGymStaff, ...args);
export const createStaffMember = (...args) => run('createStaffMember', real.createStaffMember, ...args);
export const getTrainers = (...args) => run('getTrainers', real.getTrainers, ...args);
export const getAssignedMembers = (...args) => run('getAssignedMembers', real.getAssignedMembers, ...args);
export const markAttendance = (...args) => run('markAttendance', real.markAttendance, ...args);

export const getWorkoutPlans = (...args) => run('getWorkoutPlans', real.getWorkoutPlans, ...args);
export const getPredefinedPlans = (...args) => run('getPredefinedPlans', real.getPredefinedPlans, ...args);
export const getGymCustomPlans = (...args) => run('getGymCustomPlans', real.getGymCustomPlans, ...args);
export const getWorkoutPlan = (...args) => run('getWorkoutPlan', real.getWorkoutPlan, ...args);
export const createWorkoutPlan = (...args) => run('createWorkoutPlan', real.createWorkoutPlan, ...args);
export const updateWorkoutPlan = (...args) => run('updateWorkoutPlan', real.updateWorkoutPlan, ...args);

export const getWorkoutDays = (...args) => run('getWorkoutDays', real.getWorkoutDays, ...args);
export const getWorkoutDay = (...args) => run('getWorkoutDay', real.getWorkoutDay, ...args);
export const createWorkoutDay = (...args) => run('createWorkoutDay', real.createWorkoutDay, ...args);
export const updateWorkoutDay = (...args) => run('updateWorkoutDay', real.updateWorkoutDay, ...args);

export const createWorkoutLog = (...args) => run('createWorkoutLog', real.createWorkoutLog, ...args);
export const getMemberWorkoutLogs = (...args) => run('getMemberWorkoutLogs', real.getMemberWorkoutLogs, ...args);
export const getWorkoutLog = (...args) => run('getWorkoutLog', real.getWorkoutLog, ...args);
export const getMemberTodayLog = (...args) => run('getMemberTodayLog', real.getMemberTodayLog, ...args);
export const incrementallyUpdateWorkoutLog = (...args) => run('incrementallyUpdateWorkoutLog', real.incrementallyUpdateWorkoutLog, ...args);

export const createProgressLog = (...args) => run('createProgressLog', real.createProgressLog, ...args);
export const getMemberProgressLogs = (...args) => run('getMemberProgressLogs', real.getMemberProgressLogs, ...args);

export const assignWorkoutPlanToMember = (...args) => run('assignWorkoutPlanToMember', real.assignWorkoutPlanToMember, ...args);
export const getPlanByName = (...args) => run('getPlanByName', real.getPlanByName, ...args);

export const saveSorenessLog = (...args) => run('saveSorenessLog', real.saveSorenessLog, ...args);
export const getRecentMuscleSoreness = (...args) => run('getRecentMuscleSoreness', real.getRecentMuscleSoreness, ...args);

export const checkAndUpdatePR = (...args) => run('checkAndUpdatePR', real.checkAndUpdatePR, ...args);
export const getMemberPRs = (...args) => run('getMemberPRs', real.getMemberPRs, ...args);
