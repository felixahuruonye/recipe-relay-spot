import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, Save, Power, AlertCircle, TrendingUp, Trash2, ShieldAlert } from 'lucide-react';

interface ProviderConfig {
  provider_id: string;
  display_name: string;
  role: string;
  enabled: boolean;
  maintenance_mode: boolean;
  category: string;
  user_reward_percent: number;
  platform_margin_percent: number;
  fraud_reserve_percent: number;
  stars_per_usd_user_share: number;
  min_reward_stars: number | null;
  max_reward_stars: number | null;
  min_age: number;
  featured: boolean;
  sort_order: number;
}

interface DashboardData {
  providers: ProviderConfig[];
  activity: {
    clicked: number;
    pending: number;
    approved: number;
    reversed: number;
    rejected: number;
  };
  revenue: {
    provider_payout_usd: number;
    platform_margin_usd: number;
    fraud_reserve_usd: number;
    user_reward_stars: number;
  };
}

export const TaskAdminTab = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProviderConfig>>({});

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_task_dashboard');
      if (error) throw error;
      setDashboard(data);
    } catch (error: any) {
      console.error('Error loading task dashboard:', error);
      toast({
        title: 'Error loading dashboard',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditing(provider.provider_id);
    setEditValues({ ...provider });
  };

  const handleSaveProvider = async () => {
    if (!editing) return;
    try {
      const { error } = await supabase.rpc('admin_update_provider_config', {
        p_provider_id: editing,
        p_enabled: editValues.enabled,
        p_maintenance_mode: editValues.maintenance_mode,
        p_user_reward_percent: editValues.user_reward_percent,
        p_platform_margin_percent: editValues.platform_margin_percent,
        p_fraud_reserve_percent: editValues.fraud_reserve_percent,
        p_stars_per_usd_user_share: editValues.stars_per_usd_user_share,
        p_min_reward_stars: editValues.min_reward_stars,
        p_max_reward_stars: editValues.max_reward_stars,
        p_min_age: editValues.min_age,
        p_featured: editValues.featured,
        p_sort_order: editValues.sort_order,
      });

      if (error) throw error;

      toast({
        title: 'Saved',
        description: `${editValues.display_name || 'Provider'} configuration updated`,
      });

      setEditing(null);
      setEditValues({});
      loadDashboard();
    } catch (error: any) {
      console.error('Error saving provider config:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboard) {
    return <div className="text-center text-muted-foreground py-8">Failed to load dashboard</div>;
  }

  const totalPayout = dashboard.revenue.provider_payout_usd;
  const totalMargin = dashboard.revenue.platform_margin_usd;
  const totalFraudReserve = dashboard.revenue.fraud_reserve_usd;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">${totalMargin.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Platform Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-500">${totalPayout.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Provider Payouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-500">{dashboard.revenue.user_reward_stars.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">User Stars</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-500">${totalFraudReserve.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Fraud Reserve</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="providers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Provider Configuration</CardTitle>
                <Button size="sm" variant="outline" onClick={loadDashboard}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.providers.map((provider) => {
                  const isEditing = editing === provider.provider_id;
                  return (
                    <div key={provider.provider_id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{provider.display_name}</h3>
                            <Badge variant="outline" className="text-[10px]">
                              {provider.role}
                            </Badge>
                            {provider.enabled ? (
                              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px]">
                                🟢 Enabled
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-[10px]">
                                🔴 Disabled
                              </Badge>
                            )}
                            {provider.maintenance_mode && (
                              <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-[10px]">
                                ⏸ Maintenance
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{provider.category} • Sort: {provider.sort_order}</p>
                        </div>
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditProvider(provider)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="bg-muted/50 p-3 rounded-lg space-y-3 border border-border">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-semibold block mb-1">User Reward %</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={editValues.user_reward_percent}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    user_reward_percent: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Platform Margin %</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={editValues.platform_margin_percent}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    platform_margin_percent: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Fraud Reserve %</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={editValues.fraud_reserve_percent}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    fraud_reserve_percent: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Stars per USD (user share)</label>
                              <Input
                                type="number"
                                min="1"
                                value={editValues.stars_per_usd_user_share}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    stars_per_usd_user_share: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Min Reward Stars</label>
                              <Input
                                type="number"
                                value={editValues.min_reward_stars || ''}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    min_reward_stars: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Max Reward Stars</label>
                              <Input
                                type="number"
                                value={editValues.max_reward_stars || ''}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    max_reward_stars: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Min Age</label>
                              <Input
                                type="number"
                                min="13"
                                value={editValues.min_age}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    min_age: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold block mb-1">Sort Order</label>
                              <Input
                                type="number"
                                value={editValues.sort_order}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    sort_order: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editValues.enabled}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    enabled: e.target.checked,
                                  })
                                }
                              />
                              Enabled
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editValues.maintenance_mode}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    maintenance_mode: e.target.checked,
                                  })
                                }
                              />
                              Maintenance Mode
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editValues.featured}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    featured: e.target.checked,
                                  })
                                }
                              />
                              Featured
                            </label>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleSaveProvider}
                              className="gap-1.5"
                            >
                              <Save className="w-4 h-4" /> Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(null);
                                setEditValues({});
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Reward Split</p>
                            <p className="font-mono text-xs">
                              {provider.user_reward_percent}% / {provider.platform_margin_percent}% / {provider.fraud_reserve_percent}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Stars per USD</p>
                            <p className="font-mono text-xs">{provider.stars_per_usd_user_share}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Reward Range</p>
                            <p className="font-mono text-xs">
                              {provider.min_reward_stars || '—'} to {provider.max_reward_stars || '—'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-blue-500">{dashboard.activity.clicked}</div>
                  <p className="text-xs text-muted-foreground mt-2">Clicked</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-amber-500">{dashboard.activity.pending}</div>
                  <p className="text-xs text-muted-foreground mt-2">Pending</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-green-500">{dashboard.activity.approved}</div>
                  <p className="text-xs text-muted-foreground mt-2">Approved</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-red-500">{dashboard.activity.reversed}</div>
                  <p className="text-xs text-muted-foreground mt-2">Reversed</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-destructive">{dashboard.activity.rejected}</div>
                  <p className="text-xs text-muted-foreground mt-2">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-green-700">Platform Revenue</span>
                    <span className="text-lg font-bold text-green-600">${totalMargin.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-green-600/70 mt-1">45% of total provider payouts</p>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-700">User Earnings (Stars)</span>
                    <span className="text-lg font-bold text-blue-600">{dashboard.revenue.user_reward_stars.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-blue-600/70 mt-1">50% of provider payouts, converted to stars</p>
                </div>

                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-700">Fraud Reserve</span>
                    <span className="text-lg font-bold text-amber-600">${totalFraudReserve.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-amber-600/70 mt-1">5% set aside for chargebacks and fraud</p>
                </div>

                <div className="p-4 rounded-lg bg-slate-500/10 border border-slate-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Total Provider Payout</span>
                    <span className="text-lg font-bold text-slate-600">${totalPayout.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-slate-600/70 mt-1">Amount received from networks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Devices Tab — admin-only visibility + delete. Regular users can
            only VIEW their own device in Settings; they can never delete
            it themselves (only account deletion clears it). */}
        <TabsContent value="devices">
          <DevicesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface DeviceRow {
  id: string;
  user_id: string;
  username: string | null;
  device_id: string;
  user_agent: string | null;
  platform: string | null;
  screen_resolution: string | null;
  timezone: string | null;
  language: string | null;
  first_seen: string;
  last_seen: string;
  linked_account_count: number;
}

const DevicesPanel = () => {
  const { toast } = useToast();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_devices' as any);
      if (error) throw error;
      setDevices((data as DeviceRow[]) || []);
    } catch (error: any) {
      console.error('Error loading devices:', error);
      toast({ title: 'Error loading devices', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row: DeviceRow) => {
    if (!confirm(`Delete this device record for ${row.username || row.user_id}? This clears the fraud link.`)) return;
    setDeletingId(row.id);
    try {
      const { error } = await supabase.rpc('admin_delete_device' as any, { p_device_row_id: row.id });
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Device record removed' });
      setDevices((prev) => prev.filter((d) => d.id !== row.id));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const flagged = devices.filter((d) => d.linked_account_count > 1);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> Registered Devices
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadDevices}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {flagged.length > 0
              ? `${flagged.length} device${flagged.length > 1 ? 's are' : ' is'} linked to more than one account — the real fraud signal.`
              : 'No device is currently linked to more than one account.'}
          </p>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No devices registered yet.</p>
          ) : (
            <div className="space-y-3">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className={`border rounded-lg p-3 text-sm ${d.linked_account_count > 1 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{d.username || d.user_id}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{d.device_id?.slice(0, 20)}…</p>
                    </div>
                    {d.linked_account_count > 1 && (
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] shrink-0">
                        {d.linked_account_count} accounts
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px] text-muted-foreground">
                    <span>{d.platform || '—'}</span>
                    <span>{d.screen_resolution || '—'}</span>
                    <span>{d.timezone || '—'}</span>
                    <span>Last seen {new Date(d.last_seen).toLocaleDateString()}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 text-xs text-destructive hover:text-destructive gap-1"
                    disabled={deletingId === d.id}
                    onClick={() => handleDelete(d)}
                  >
                    {deletingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete record
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

