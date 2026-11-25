import { useState, useEffect } from 'react';
import { Users, AlertTriangle, TrendingUp, Activity, Shield } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getAdminStats, getAdminUsers, getAdminFlagged } from './mock-backend';

interface AdminDashboardProps {
  onBack: () => void;
}

export function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsData, usersData, flaggedData] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminFlagged()
      ]);

      setStats(statsData);
      setUsers(usersData.users);
      setFlagged(flaggedData.flagged);
    } catch (error) {
      console.error('Admin data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate tier distribution
  const tierCounts = users.reduce((acc: any, user: any) => {
    if (user.subscriptionStatus === 'active') {
      acc[user.subscriptionTier] = (acc[user.subscriptionTier] || 0) + 1;
    }
    return acc;
  }, {});

  const tierData = Object.entries(tierCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value
  }));

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

  // Calculate risk score distribution
  const riskBuckets = { low: 0, medium: 0, high: 0 };
  users.forEach((user: any) => {
    const score = user.riskScore || 0;
    if (score < 30) riskBuckets.low++;
    else if (score < 70) riskBuckets.medium++;
    else riskBuckets.high++;
  });

  const riskData = [
    { name: 'Low Risk', value: riskBuckets.low, color: '#10B981' },
    { name: 'Medium Risk', value: riskBuckets.medium, color: '#F59E0B' },
    { name: 'High Risk', value: riskBuckets.high, color: '#EF4444' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ZyroSafe Admin</h1>
            <p className="text-sm text-gray-600">System Monitoring & Management</p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Back to Login
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Total Users</p>
              <Users className="text-blue-600" size={20} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.activeSubscriptions || 0} active
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Total Payouts</p>
              <TrendingUp className="text-green-600" size={20} />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              ₹{stats?.totalPayoutsAmount || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.totalPayoutsCount || 0} claims
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Weekly Revenue</p>
              <Activity className="text-purple-600" size={20} />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              ₹{stats?.weeklyPremiumRevenue || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">Premium collections</p>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Pool Balance</p>
              <Shield className="text-indigo-600" size={20} />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              ₹{stats?.poolBalance || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">Available liquidity</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscription Tier Distribution */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Subscription Distribution
            </h3>
            {tierData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={tierData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {tierData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-600 text-center py-12">No subscription data</p>
            )}
          </div>

          {/* Risk Score Distribution */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Risk Score Distribution
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={riskData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Flagged Claims */}
        {flagged.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-yellow-600" size={20} />
              Flagged Claims ({flagged.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {flagged.map((claim: any, index: number) => (
                <div
                  key={index}
                  className="border border-yellow-200 bg-yellow-50 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">User: {claim.userId}</p>
                      <p className="text-sm text-gray-600">
                        Risk Score: <span className="font-semibold">{claim.riskScore}/100</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Location: {claim.latitude?.toFixed(4)}, {claim.longitude?.toFixed(4)}
                      </p>
                      {claim.weatherDisruption?.disrupted && (
                        <p className="text-sm text-gray-600">
                          Weather: {claim.weatherDisruption.type} ({claim.weatherDisruption.severity})
                        </p>
                      )}
                      {claim.socialDisruption?.disrupted && (
                        <p className="text-sm text-gray-600">
                          Social: {claim.socialDisruption.type} (confidence: {claim.socialDisruption.confidence})
                        </p>
                      )}
                    </div>
                    <span className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-xs font-semibold">
                      UNDER REVIEW
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(claim.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User List */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">All Users</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    City
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Subscription
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Risk Score
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Claims
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Total Payouts
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any, index: number) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm">{user.name}</td>
                    <td className="py-3 px-4 text-sm">{user.email}</td>
                    <td className="py-3 px-4 text-sm">{user.city}</td>
                    <td className="py-3 px-4 text-sm">
                      {user.subscriptionStatus === 'active' ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          {user.subscriptionTier?.toUpperCase()}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`font-semibold ${
                        (user.riskScore || 0) < 30
                          ? 'text-green-600'
                          : (user.riskScore || 0) < 70
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}>
                        {user.riskScore || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">{user.claimCount || 0}</td>
                    <td className="py-3 px-4 text-sm">₹{user.totalPayouts || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
