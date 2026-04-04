import { useRef } from 'react';

const Step3Photos = ({ data, setData }) => {
  const logoInputRef = useRef(null);
  const photoInputRefs = useRef([]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setData({
        ...data,
        logoFile: file,
        logoPreview: reader.result,
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = (index, e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const newPhotos = [...data.photos];
      newPhotos[index] = { file, preview: reader.result };
      setData({ ...data, photos: newPhotos });
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (index) => {
    const newPhotos = [...data.photos];
    newPhotos[index] = null;
    setData({ ...data, photos: newPhotos });
  };

  return (
    <>
      <div className="step-header">
        <h2 className="step-title">Photos &amp; Logo</h2>
        <p className="step-subtitle">Step 3 of 5 — Show off your gym</p>
      </div>

      {/* Logo Upload */}
      <div className="input-group">
        <label className="input-label">Gym logo</label>
        <div
          className="upload-zone"
          onClick={() => logoInputRef.current?.click()}
          style={{ height: 140 }}
          id="logo-upload-zone"
        >
          {data.logoPreview ? (
            <>
              <img src={data.logoPreview} alt="Logo preview" className="upload-preview" />
              <div className="upload-preview-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="white"/>
                </svg>
              </div>
            </>
          ) : (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0" stroke="#534AB7" strokeWidth="1.5"/>
                <path d="M16.01 4H7.99L6 6H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V7a1 1 0 00-1-1h-3l-1.99-2z" stroke="#534AB7" strokeWidth="1.5" fill="none"/>
              </svg>
              <span className="upload-zone-text">Upload gym logo</span>
              <span className="upload-zone-hint">PNG or JPG, max 2MB</span>
            </>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden-input"
            onChange={handleLogoUpload}
          />
        </div>
      </div>

      {/* Photos Grid */}
      <div className="input-group">
        <label className="input-label">Gym photos (optional)</label>
        <div className="photo-grid">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`photo-slot ${data.photos[index] ? 'filled' : ''}`}
              onClick={() => {
                if (!data.photos[index]) {
                  photoInputRefs.current[index]?.click();
                }
              }}
              id={`photo-slot-${index}`}
            >
              {data.photos[index] ? (
                <>
                  <img src={data.photos[index].preview} alt={`Gym photo ${index + 1}`} />
                  <button
                    className="photo-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePhoto(index);
                    }}
                    type="button"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="#534AB7" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
              <input
                ref={(el) => (photoInputRefs.current[index] = el)}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden-input"
                onChange={(e) => handlePhotoUpload(index, e)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Step3Photos;
