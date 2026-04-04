import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createGym, createUser } from '../../firebase/firestore';
import { uploadLogo, uploadPhoto } from '../../firebase/storage';
import Step1BasicInfo from './steps/Step1BasicInfo';
import Step2Location from './steps/Step2Location';
import Step3Photos from './steps/Step3Photos';
import Step4Plans from './steps/Step4Plans';
import Step5Review from './steps/Step5Review';
import './GymRegistration.css';

const INITIAL_DATA = {
  ownerName: '',
  gymName: '',
  city: '',
  address: '',
  gymType: '',
  openTime: '',
  closeTime: '',
  branches: '1',
  logoFile: null,
  logoPreview: null,
  photos: [null, null, null, null],
  plans: [],
};

const GymRegistration = () => {
  const navigate = useNavigate();
  const { user, refreshUserDoc } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [data, setData] = useState(INITIAL_DATA);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validateStep = (stepNum) => {
    const newErrors = {};

    if (stepNum === 1) {
      if (!data.ownerName.trim() || data.ownerName.trim().length < 2)
        newErrors.ownerName = 'Name must be at least 2 characters';
      if (!data.gymName.trim() || data.gymName.trim().length < 2)
        newErrors.gymName = 'Gym name must be at least 2 characters';
    }

    if (stepNum === 2) {
      if (!data.city.trim()) newErrors.city = 'City is required';
      if (!data.address.trim()) newErrors.address = 'Address is required';
      if (!data.gymType) newErrors.gymType = 'Please select a gym type';
      if (!data.openTime.trim()) newErrors.openTime = 'Open time is required';
      if (!data.closeTime.trim()) newErrors.closeTime = 'Close time is required';
    }

    if (stepNum === 4) {
      const activePlans = data.plans.filter((p) => p.isActive);
      const validPlans = activePlans.filter((p) => p.price && Number(p.price) > 0);
      if (validPlans.length === 0) {
        newErrors.plans = 'At least one plan must be active with a price greater than 0';
      }
      activePlans.forEach((p) => {
        if (p.price && Number(p.price) > 0 && !p.name.trim()) {
          newErrors.plans = 'All plans with a price must have a name';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (!validateStep(step)) return;

    if (step < 5) {
      setStep(step + 1);
      setErrors({});
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setErrors({});
    }
  };

  const handleSkipPhotos = () => {
    setData({
      ...data,
      logoFile: null,
      logoPreview: null,
      photos: [null, null, null, null],
    });
    setStep(4);
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // 1. Upload logo if exists
      let logo_url = '';
      const tempGymId = `gym_${Date.now()}`;

      if (data.logoFile) {
        logo_url = await uploadLogo(tempGymId, data.logoFile);
      }

      // 2. Upload photos
      const photoUrls = [];
      for (let i = 0; i < data.photos.length; i++) {
        if (data.photos[i]?.file) {
          const url = await uploadPhoto(tempGymId, data.photos[i].file, i);
          photoUrls.push(url);
        }
      }

      // 3. Prepare plans
      const plans = data.plans
        .filter((p) => p.isActive && p.price && Number(p.price) > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          type: p.name.toLowerCase().includes('month')
            ? 'monthly'
            : p.name.toLowerCase().includes('quarter')
              ? 'quarterly'
              : p.name.toLowerCase().includes('annual')
                ? 'annual'
                : 'custom',
          price: Number(p.price),
          duration_days: Number(p.duration) || 30,
          benefits: [],
          is_active: true,
        }));

      // 4. Create gym document
      const gymData = {
        name: data.gymName.trim(),
        owner_id: user.uid,
        owner_name: data.ownerName.trim(),
        phone: user.phoneNumber || '',
        city: data.city.trim(),
        address: data.address.trim(),
        gym_type: data.gymType,
        working_hours: {
          open: data.openTime.trim(),
          close: data.closeTime.trim(),
        },
        photos: photoUrls,
        logo_url,
        no_of_branches: Number(data.branches) || 1,
        settings: { plans },
      };

      const gymId = await createGym(gymData);

      // 5. Create user document
      await createUser(user.uid, {
        name: data.ownerName.trim(),
        phone: user.phoneNumber || '',
        role: 'owner',
        gym_id: gymId,
        permissions: ['all'],
        subscription_expiry: null,
        payment_status: null,
        plan_id: null,
        start_date: null,
        workout_plan_id: null,
        height: null,
        weight: null,
        goal: null,
        experience: null,
        medical_notes: null,
      });

      // 6. Refresh auth context and navigate
      await refreshUserDoc(user.uid);
      navigate('/owner/setup', { replace: true });
    } catch (err) {
      console.error('Gym creation error:', err);
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1BasicInfo data={data} setData={setData} errors={errors} />;
      case 2:
        return <Step2Location data={data} setData={setData} errors={errors} />;
      case 3:
        return <Step3Photos data={data} setData={setData} />;
      case 4:
        return <Step4Plans data={data} setData={setData} errors={errors} />;
      case 5:
        return <Step5Review data={data} loading={loading} />;
      default:
        return null;
    }
  };

  return (
    <div className="screen register-screen">
      <div className="screen-content">
        {/* Back button */}
        <button className="back-btn" onClick={handleBack} disabled={step === 1}>
          ← Back
        </button>

        {/* Progress dots */}
        <div className="wizard-progress">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`wizard-dot ${
                s < step ? 'completed' : s === step ? 'active' : 'upcoming'
              }`}
            />
          ))}
        </div>

        {/* Current step */}
        {renderStep()}

        {/* Action buttons */}
        <div className="wizard-buttons">
          <button
            className="btn-primary"
            onClick={handleContinue}
            disabled={loading}
            id="wizard-continue-btn"
          >
            {loading ? (
              <div className="spinner" />
            ) : step === 5 ? (
              'Create my gym →'
            ) : (
              'Continue →'
            )}
          </button>

          {step === 3 && (
            <button
              className="text-link"
              onClick={handleSkipPhotos}
              style={{ alignSelf: 'center', marginTop: 4 }}
              type="button"
            >
              Skip for now →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GymRegistration;
