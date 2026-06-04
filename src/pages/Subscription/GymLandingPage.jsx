import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGym } from '../../firebase/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import InquiryModal from '../../components/InquiryModal';

const GymLandingPage = () => {
  const { gymId } = useParams();
  const navigate = useNavigate();
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [trainers, setTrainers] = useState([]);

  useEffect(() => {
    if (!gymId) return;
    
    getGym(gymId)
      .then((data) => {
        if (data) {
          setGym(data);
        } else {
          setError('Gym not found');
        }
      })
      .catch((err) => {
        console.error('Error fetching gym:', err);
        setError('Failed to load gym details');
      })
      .finally(() => setLoading(false));

    const fetchTrainers = async () => {
      if (localStorage.getItem('mockRole')) {
        setTrainers([
          { id: 's1', name: 'Alex Rivera', qualification: 'NASM CPT', tags: ['Fat Loss', 'Strength'], image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=200&auto=format&fit=crop' },
          { id: 's2', name: 'Sarah Chen', qualification: 'ACE CPT', tags: ['Functional', 'Mobility'], image: 'https://images.unsplash.com/photo-1548690312-e3b507d8c110?q=80&w=200&auto=format&fit=crop' },
        ]);
        return;
      }
      if (!auth?.currentUser) return;
      try {
        const q = query(collection(db, 'users'), where('gym_id', '==', gymId), where('role', '==', 'trainer'));
        const snap = await getDocs(q);
        const trainerList = [];
        snap.forEach(doc => trainerList.push({ id: doc.id, ...doc.data() }));
        if (trainerList.length === 0) {
          setTrainers([
            { id: 'mock1', name: 'Expert Coach 1', qualification: 'Certified PT', tags: ['Strength'] },
            { id: 'mock2', name: 'Expert Coach 2', qualification: 'Yoga Instructor', tags: ['Flexibility'] }
          ]);
        } else {
          setTrainers(trainerList);
        }
      } catch (err) {
        console.error('Error fetching trainers:', err);
      }
    };
    fetchTrainers();
  }, [gymId]);

  if (loading) return <div className="mesh-bg min-h-screen flex items-center justify-center"><div className="spinner spinner-primary w-10 h-10" /></div>;
  if (error || !gym) return <div className="mesh-bg min-h-screen flex items-center justify-center text-on-surface font-headline-md">{error || 'Something went wrong'}</div>;

  const heroImage = (gym.photos && gym.photos.length > 0) ? gym.photos[0].url : 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop';
  const cleanPhone = gym.phone ? String(gym.phone).replace(/[^0-9]/g, '') : null;
  const allPlans = gym?.settings?.plans?.filter(p => p.is_active) || [];
  const membershipPlans = allPlans.filter(p => !p.name.toLowerCase().includes('trainer'));

  const amenitiesList = (gym.landingConfig?.facilities?.length > 0) ? gym.landingConfig.facilities : ['Modern Equipment', 'Expert Coaches', 'Personalized Plans', 'Community Focus'];
  const amenityIcons = ['fitness_center', 'group', 'settings', 'groups'];

  return (
    <div className="mesh-bg min-h-screen text-on-surface pb-24 font-body-md overflow-x-hidden antialiased">
      
      {/* Top Bar */}
      <nav className="absolute top-0 w-full z-50 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2 text-white font-headline-md text-xl">
          <span className="material-symbols-outlined text-secondary">fitness_center</span> Gymly
        </div>
        <button onClick={() => navigate('/login')} className="px-4 py-2 bg-white/20 backdrop-blur-md text-white rounded-full font-label-md text-sm border border-white/20 hover:bg-white/30 transition-colors">
          Member Login
        </button>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full h-[85vh] min-h-[600px] flex items-center justify-center">
        <div className="absolute inset-0 w-full h-full bg-black/40 z-0"></div>
        <img src={heroImage} alt="Gym Hero" className="absolute inset-0 w-full h-full object-cover z-[-1] filter brightness-[0.7]" />
        
        <div className="relative z-10 w-[92%] max-w-sm md:max-w-md mx-auto glass-panel p-6 md:p-8 rounded-[32px] flex flex-col items-center text-center shadow-2xl border border-white/40">
           <div className="bg-white/20 px-3 py-1 rounded-full border border-white/30 text-white font-label-sm text-[10px] md:text-xs flex items-center gap-2 mb-4 backdrop-blur-md uppercase tracking-widest">
             <span className="material-symbols-outlined text-[14px]">fitness_center</span> Powered by Gymly
           </div>
           
           <h1 className="font-display-lg text-4xl md:text-5xl font-bold text-white mb-2 leading-tight">{gym.name}</h1>
           <p className="font-body-md md:font-body-lg text-white/90 mb-4">{gym.description ? gym.description.slice(0, 50) + '...' : 'Elevate Your Fitness'}</p>
           
           <div className="font-label-sm md:font-label-md text-white/80 flex items-center justify-center gap-1 mb-4">
             <span className="material-symbols-outlined text-[16px]">location_on</span> {gym.city || 'City'}, {gym.address?.split(',')[0] || 'State'}
           </div>
           
           <div className="flex items-center justify-center gap-1 mb-6 text-white bg-black/20 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
             <span className="text-[#FBBF24] text-sm">★ ★ ★ ★ ★</span> <span className="font-label-sm ml-2">4.9 (500+)</span>
           </div>
           
           <div className="flex justify-between w-full border-t border-white/20 pt-5 mb-6 text-white">
              <div className="text-center"><div className="font-headline-lg font-bold text-xl md:text-2xl">500+</div><div className="font-label-sm text-white/60 mt-1 uppercase tracking-wider text-[9px] md:text-[10px]">Members</div></div>
              <div className="text-center"><div className="font-headline-lg font-bold text-xl md:text-2xl">{trainers.length || '15'}+</div><div className="font-label-sm text-white/60 mt-1 uppercase tracking-wider text-[9px] md:text-[10px]">Trainers</div></div>
              <div className="text-center"><div className="font-headline-lg font-bold text-xl md:text-2xl">10+</div><div className="font-label-sm text-white/60 mt-1 uppercase tracking-wider text-[9px] md:text-[10px]">Years</div></div>
           </div>
           
           <div className="flex w-full gap-3">
             <button onClick={() => setShowInquiry(true)} className="flex-1 bg-[#5046e5] text-white py-3 md:py-3.5 rounded-xl font-label-md font-bold shadow-[0_4px_15px_rgba(80,70,229,0.4)] hover:bg-[#4338ca] transition-all transform hover:scale-[1.02]">
               Join Now
             </button>
             <button onClick={() => setShowInquiry(true)} className="flex-1 bg-white/10 border border-white/30 text-white py-3 md:py-3.5 rounded-xl font-label-md font-bold hover:bg-white/20 transition-all backdrop-blur-md">
               Free Trial
             </button>
           </div>
        </div>

        {/* Floating WhatsApp on Hero (Desktop) */}
        {cleanPhone && (
          <a href={`https://wa.me/${cleanPhone}`} target="_blank" rel="noreferrer" className="hidden md:flex absolute bottom-8 right-8 w-14 h-14 bg-white/90 backdrop-blur-md rounded-2xl items-center justify-center shadow-2xl hover:scale-110 transition-transform z-10 border border-white/50">
            <span className="material-symbols-outlined text-3xl text-[#25D366]">chat</span>
          </a>
        )}
      </section>

      {/* About & Amenities */}
      <section className="px-4 py-12 md:py-20 max-w-5xl mx-auto">
        <h2 className="font-headline-lg text-3xl md:text-4xl text-on-surface mb-3 tracking-tight">About {gym.name}</h2>
        <p className="font-body-md md:font-body-lg text-on-surface-variant mb-10 md:w-3/4 leading-relaxed">
          {gym.description || `${gym.name} is committed to empowering you to reach your full potential through world-class facilities and expert guidance.`}
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {amenitiesList.slice(0,4).map((amenity, i) => (
            <div key={i} className="glass-panel p-5 md:p-6 rounded-2xl md:rounded-[24px] bg-secondary-container/10 border border-white/60 hover:bg-white/40 transition-colors shadow-sm flex flex-col items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#5046e5]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl text-[#5046e5]">{amenityIcons[i % 4]}</span>
              </div>
              <h4 className="font-label-md text-on-surface font-bold text-sm md:text-base leading-snug">{amenity}</h4>
            </div>
          ))}
        </div>
      </section>

      {/* Trainers */}
      {trainers.length > 0 && (
        <section className="px-4 py-8 md:py-16 bg-surface/50 border-y border-white/20">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-headline-lg text-2xl md:text-3xl text-on-surface mb-8">Meet Our Expert Trainers</h2>
            
            <div className="flex overflow-x-auto pb-8 -mx-4 px-4 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:mx-0 gap-4 md:gap-6 snap-x" style={{ scrollbarWidth: 'none' }}>
              {trainers.map((trainer, i) => (
                <div key={i} className="glass-panel min-w-[240px] md:min-w-0 rounded-[28px] overflow-hidden flex flex-col bg-white/30 border border-white/50 shadow-sm snap-center">
                  <div className="h-48 md:h-64 bg-surface-variant relative overflow-hidden flex items-center justify-center">
                    {trainer.image ? (
                      <img src={trainer.image} alt={trainer.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-6xl text-white/40">person</span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent"></div>
                  </div>
                  <div className="p-5 md:p-6 relative -mt-10 bg-white/60 backdrop-blur-lg flex-1">
                    <h3 className="font-headline-md text-xl font-bold text-on-surface mb-1">{trainer.name}</h3>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(trainer.tags || ['Strength', 'Conditioning']).map((tag, t) => (
                        <span key={t} className="px-2 py-0.5 bg-secondary-container/20 text-secondary rounded-full font-label-sm text-[10px] uppercase tracking-wider">{tag}</span>
                      ))}
                    </div>
                    
                    <p className="font-label-sm text-on-surface-variant opacity-80">{trainer.qualification || 'Certified Professional Trainer'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Plans & Capacity */}
      <section className="px-4 py-12 md:py-20 max-w-5xl mx-auto">
        <h2 className="font-headline-lg text-2xl md:text-3xl text-on-surface mb-8">Membership Plans</h2>
        
        {/* Capacity Indicator */}
        <div className="glass-panel rounded-2xl p-5 md:p-6 mb-8 flex items-center justify-between bg-white/40 border border-white/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-tertiary animate-pulse"></div>
              <h4 className="font-label-md font-bold text-on-surface">Live Gym Capacity</h4>
            </div>
            <p className="font-label-sm text-on-surface-variant">Currently Moderately Busy</p>
          </div>
          <div className="font-display-lg text-4xl text-primary font-bold">42%</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {membershipPlans.length > 0 ? membershipPlans.map((plan, i) => (
            <div key={i} className="glass-panel rounded-[32px] p-6 md:p-8 border border-white/60 bg-white/30 hover:bg-white/40 transition-colors flex flex-col shadow-sm">
              <h3 className="font-headline-md text-xl font-bold text-on-surface mb-4">{plan.name}</h3>
              <div className="mb-6">
                <span className="font-body-md text-on-surface-variant mr-1">₹</span>
                <span className="font-display-lg text-4xl font-bold text-on-surface">{plan.price.toLocaleString('en-IN')}</span>
                <span className="font-label-sm text-on-surface-variant ml-1">/ {plan.duration_days} days</span>
              </div>
              <p className="font-body-sm text-on-surface-variant mb-8 flex-1">{plan.description || `Full access to all facilities and group classes for ${plan.duration_days} days.`}</p>
              <button onClick={() => setShowInquiry(true)} className="w-full py-3 rounded-xl bg-[#5046e5]/10 text-[#5046e5] font-label-md font-bold hover:bg-[#5046e5]/20 transition-colors border border-[#5046e5]/20">
                Choose Plan
              </button>
            </div>
          )) : (
            <div className="col-span-3 text-center py-10 font-body-md text-on-surface-variant">Plans are currently being updated. Contact us for details.</div>
          )}
        </div>
      </section>

      {/* Grand CTA */}
      <section className="px-4 py-6 max-w-5xl mx-auto mb-12">
        <div className="rounded-[32px] p-8 md:p-12 bg-gradient-to-br from-[#5046e5] to-[#7c3aed] text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-8">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-[40px] pointer-events-none"></div>
          <div className="relative z-10 md:w-2/3">
            <h2 className="font-display-lg text-3xl md:text-4xl font-bold mb-4">Start Your Fitness Journey Today</h2>
            <p className="font-body-md md:font-body-lg text-white/80">Join our community and achieve your goals with world-class facilities and expert guidance.</p>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button onClick={() => setShowInquiry(true)} className="px-8 py-3.5 bg-white text-[#5046e5] rounded-xl font-label-md font-bold hover:bg-white/90 transition-colors shadow-lg">Join Now</button>
            <button onClick={() => setShowInquiry(true)} className="px-8 py-3.5 bg-white/10 border border-white/30 text-white rounded-xl font-label-md font-bold hover:bg-white/20 transition-colors">Book Free Trial</button>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="px-4 py-8 max-w-5xl mx-auto mb-10">
        <div className="glass-panel rounded-[32px] p-6 md:p-8 bg-white/40 border border-white/60 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="font-headline-md text-xl md:text-2xl font-bold text-on-surface mb-4">Location & Hours</h3>
            <p className="font-body-md text-on-surface-variant mb-1">{gym.address || '123 Fitness Blvd'}</p>
            <p className="font-body-md text-on-surface-variant mb-6">{gym.city || 'City'}, {gym.state || 'State'} {gym.pincode}</p>
            
            <p className="font-body-md text-on-surface-variant mb-1">Mon-Fri: 5AM - 11PM</p>
            <p className="font-body-md text-on-surface-variant">Sat-Sun: 7AM - 9PM</p>
          </div>
          
          <div className="w-full md:w-1/2 h-48 bg-secondary-container/20 rounded-[24px] relative overflow-hidden border border-white/50 flex items-center justify-center">
            {/* Map placeholder pattern */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
            <div className="w-12 h-12 bg-[#5046e5] rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(80,70,229,0.5)] z-10">
              <span className="material-symbols-outlined">location_on</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center flex flex-col items-center">
        <div className="flex items-center gap-2 font-display-lg text-xl text-on-surface font-bold mb-6">
          <span className="material-symbols-outlined text-[#5046e5]">fitness_center</span> {gym.name}
        </div>
        
        <div className="flex gap-4 mb-8">
          <a href="#" className="w-10 h-10 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-on-surface-variant hover:text-[#5046e5] transition-colors"><span className="material-symbols-outlined text-lg">public</span></a>
          <a href="#" className="w-10 h-10 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-on-surface-variant hover:text-[#5046e5] transition-colors"><span className="material-symbols-outlined text-lg">camera_alt</span></a>
        </div>
        
        <p className="font-label-sm text-on-surface-variant/60">Powered by Gymly</p>
      </footer>

      {/* Sticky Bottom Action Bar (Mobile Priority) */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-surface/60 backdrop-blur-3xl border-t border-white/20 z-50 flex items-center justify-between gap-3 md:hidden">
        <div className="flex gap-2">
          <a href={cleanPhone ? `tel:${cleanPhone}` : '#'} className="w-12 h-12 rounded-xl bg-white/60 border border-black/5 flex items-center justify-center shadow-sm text-on-surface-variant hover:text-[#5046e5]">
            <span className="material-symbols-outlined">call</span>
          </a>
          <a href={cleanPhone ? `https://wa.me/${cleanPhone}` : '#'} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-xl bg-white/60 border border-black/5 flex items-center justify-center shadow-sm text-on-surface-variant hover:text-[#25D366]">
            <span className="material-symbols-outlined">chat</span>
          </a>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(gym.name + ' ' + gym.address)}`} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-xl bg-white/60 border border-black/5 flex items-center justify-center shadow-sm text-on-surface-variant hover:text-[#5046e5]">
            <span className="material-symbols-outlined">directions</span>
          </a>
        </div>
        <button onClick={() => setShowInquiry(true)} className="flex-1 bg-[#5046e5] text-white h-12 rounded-xl font-label-md font-bold shadow-lg hover:bg-[#4338ca] transition-colors">
          Join Now
        </button>
      </div>

      {showInquiry && (
        <InquiryModal gymId={gymId} gymPhone={gym.phone} gymName={gym.name} onClose={() => setShowInquiry(false)} />
      )}
    </div>
  );
};

export default GymLandingPage;
