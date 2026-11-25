import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingUp, MapPin, Clock, CheckCircle } from 'lucide-react';
import { getProfile, subscribe, checkDisruption } from './mock-backend';

interface PartnerDashboardProps {
  accessToken: string;
  userId: string;
  onLogout: () => void;
}

export function PartnerDashboard({ accessToken, userId, onLogout }: PartnerDashboardProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingDisruption, setCheckingDisruption] = useState(false);
  const [disruptionResult, setDisruptionResult] = useState<any>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    fetchProfile(userId);
    getLocation();
  }, [userId]);

  const fetchProfile = async (uid: string) => {
    try {
      const data = await getProfile(uid);
      setProfile(data);
    } catch (error) {
      console.error('Profile fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.error('Geolocation error:', error);
          // Use demo location (Hyderabad)
          setLocation({ lat: 17.385044, lon: 78.486671 });
        }
      );
    } else {
      // Use demo location
      setLocation({ lat: 17.385044, lon: 78.486671 });
    }
  };

  const handleSubscribe = async (tier: string) => {
    if (!userId) return;
    try {
      const result = await subscribe(userId, tier);

      if (result.success) {
        alert(`Successfully subscribed to ${tier} plan! Weekly premium: ₹${result.weeklyPremium}`);
        await fetchProfile(userId);
      } else {
        alert(result.error || 'Subscription failed');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Subscription failed');
    }
  };

  const handleCheckDisruption = async () => {
    if (!location || !userId) {
      alert('Location not available');
      return;
    }

    setCheckingDisruption(true);
    setDisruptionResult(null);

    try {
      const data = await checkDisruption(userId, location.lat, location.lon);
      setDisruptionResult(data);

      if (data.disrupted && data.status === 'approved') {
        await fetchProfile(userId); // Refresh profile to show new payout
      }
    } catch (error) {
      console.error('Disruption check error:', error);
      setDisruptionResult({ error: 'Failed to check disruptions' });
    } finally {
      setCheckingDisruption(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const userProfile = profile?.profile;
  const recentPayouts = profile?.recentPayouts || [];
  const isSubscribed = userProfile?.subscriptionStatus === 'active';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ZyroSafe</h1>
            <p className="text-sm text-gray-600">Delivery Partner Dashboard</p>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-medium">{userProfile?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Weekly Income</p>
              <p className="font-medium">₹{userProfile?.weeklyIncome || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Weekly Hours</p>
              <p className="font-medium">{userProfile?.weeklyHours || 0}h</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Hourly Rate</p>
              <p className="font-medium">
                ₹{userProfile?.weeklyIncome && userProfile?.weeklyHours
                  ? Math.round(userProfile.weeklyIncome / userProfile.weeklyHours)
                  : 0}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Status */}
        {!isSubscribed ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="text-yellow-600 mt-1" size={24} />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">No Active Subscription</h3>
                <p className="text-gray-700 mb-4">
                  Subscribe to a plan to protect yourself from weather and social disruptions.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Basic Plan */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Basic</h4>
                    <p className="text-2xl font-bold text-blue-600 mb-2">
                      ₹{Math.round((userProfile?.weeklyIncome || 0) * 0.05)}
                      <span className="text-sm text-gray-600">/week</span>
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      80% income replacement
                    </p>
                    <button
                      onClick={() => handleSubscribe('basic')}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                      Subscribe
                    </button>
                  </div>

                  {/* Standard Plan */}
                  <div className="bg-white border-2 border-blue-500 rounded-lg p-4 relative">
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      POPULAR
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">Standard</h4>
                    <p className="text-2xl font-bold text-blue-600 mb-2">
                      ₹{Math.round((userProfile?.weeklyIncome || 0) * 0.07)}
                      <span className="text-sm text-gray-600">/week</span>
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      100% income replacement
                    </p>
                    <button
                      onClick={() => handleSubscribe('standard')}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                      Subscribe
                    </button>
                  </div>

                  {/* Premium Plan */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Premium</h4>
                    <p className="text-2xl font-bold text-blue-600 mb-2">
                      ₹{Math.round((userProfile?.weeklyIncome || 0) * 0.10)}
                      <span className="text-sm text-gray-600">/week</span>
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      120% income replacement
                    </p>
                    <button
                      onClick={() => handleSubscribe('premium')}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                      Subscribe
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Active Coverage */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <Shield className="text-green-600" size={32} />
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Active Coverage: {userProfile?.subscriptionTier?.toUpperCase()} Plan
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Weekly Premium</p>
                      <p className="font-semibold text-gray-900">
                        ₹{Math.round(userProfile?.weeklyPremium || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Payouts</p>
                      <p className="font-semibold text-gray-900">
                        ₹{Math.round(userProfile?.totalPayouts || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Claims</p>
                      <p className="font-semibold text-gray-900">
                        {userProfile?.claimCount || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Risk Score</p>
                      <p className="font-semibold text-gray-900">
                        {userProfile?.riskScore || 0}/100
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Check Disruption */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin size={20} />
                Check for Disruptions
              </h3>
              <p className="text-gray-600 mb-4">
                Your location: {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Unavailable'}
              </p>
              <button
                onClick={handleCheckDisruption}
                disabled={checkingDisruption || !location}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {checkingDisruption ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Checking...
                  </>
                ) : (
                  <>
                    <Shield size={20} />
                    Check Disruption Status
                  </>
                )}
              </button>

              {disruptionResult && (
                <div className={`mt-4 p-4 rounded-lg ${
                  disruptionResult.error || disruptionResult.status === 'rejected'
                    ? 'bg-red-50 border border-red-200'
                    : disruptionResult.disrupted && disruptionResult.status === 'approved'
                    ? 'bg-green-50 border border-green-200'
                    : disruptionResult.status === 'under_review'
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  {disruptionResult.error ? (
                    <p className="text-red-700 font-medium">{disruptionResult.error}</p>
                  ) : disruptionResult.disrupted && disruptionResult.status === 'approved' ? (
                    <div>
                      <p className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                        <CheckCircle size={20} />
                        Payout Approved!
                      </p>
                      <p className="text-gray-700">
                        <strong>Amount:</strong> ₹{disruptionResult.payout}
                      </p>
                      <p className="text-gray-700">
                        <strong>Type:</strong> {disruptionResult.disruptionType?.replace('_', ' ')}
                      </p>
                      <p className="text-gray-700">
                        <strong>Lost Hours:</strong> {disruptionResult.lostHours}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">{disruptionResult.message}</p>
                    </div>
                  ) : disruptionResult.status === 'under_review' ? (
                    <div>
                      <p className="font-semibold text-yellow-700 mb-2">Claim Under Review</p>
                      <p className="text-gray-700">
                        Risk Score: {disruptionResult.riskScore}/100
                      </p>
                      <p className="text-sm text-gray-600 mt-2">{disruptionResult.message}</p>
                    </div>
                  ) : (
                    <p className="text-gray-700">{disruptionResult.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Recent Payouts */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp size={20} />
                Recent Payouts
              </h3>
              {recentPayouts.length === 0 ? (
                <p className="text-gray-600">No payouts yet</p>
              ) : (
                <div className="space-y-3">
                  {recentPayouts.map((payout: any, index: number) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 flex justify-between items-start"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">₹{payout.amount}</p>
                        <p className="text-sm text-gray-600">
                          {payout.disruptionType?.replace('_', ' ')} - {payout.severity}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <Clock size={12} />
                          {new Date(payout.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        payout.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {payout.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
