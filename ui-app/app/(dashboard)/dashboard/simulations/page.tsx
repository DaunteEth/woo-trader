'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Play, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Simulation {
  id: string;
  name: string;
  description?: string;
  balance: number;
  isActive: boolean;
  strategyConfigs?: {
    id: string;
    name: string;
    enabled: boolean;
    weight: number;
  }[];
  performanceStats?: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
  };
  _count?: {
    signals: number;
    trades: number;
    positions: number;
  };
}

export default function SimulationsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSimulation, setNewSimulation] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    fetchSimulations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSimulations = async () => {
    try {
      const response = await fetch('/api/simulations');
      const data = await response.json();
      setSimulations(data.simulations || []);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load simulations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createSimulation = async () => {
    if (!newSimulation.name) {
      toast({
        title: 'Error',
        description: 'Simulation name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSimulation),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create simulation');
      }

      toast({
        title: 'Success',
        description: 'Simulation created successfully',
      });

      setCreateDialogOpen(false);
      setNewSimulation({ name: '', description: '' });
      fetchSimulations();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create simulation',
        variant: 'destructive',
      });
    }
  };

  const activateSimulation = async (simulationId: string) => {
    try {
      const response = await fetch(`/api/simulations/${simulationId}/activate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to activate simulation');
      }

      toast({
        title: 'Success',
        description: 'Simulation activated',
      });

      fetchSimulations();
      // Refresh the page to update the header
      window.location.reload();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to activate simulation',
        variant: 'destructive',
      });
    }
  };

  const deleteSimulation = async (simulationId: string) => {
    if (!confirm('Are you sure you want to delete this simulation? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/simulations/${simulationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete simulation');
      }

      toast({
        title: 'Success',
        description: 'Simulation deleted',
      });

      fetchSimulations();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete simulation',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="p-6">Loading simulations...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Simulations</h1>
          <p className="text-gray-400">
            Manage your trading simulations and strategies
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Simulation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Simulation</DialogTitle>
              <DialogDescription>
                Start a new trading simulation with its own balance and strategy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Simulation Name</Label>
                <Input
                  id="name"
                  value={newSimulation.name}
                  onChange={(e) => setNewSimulation({ ...newSimulation, name: e.target.value })}
                  placeholder="My Trading Strategy"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={newSimulation.description}
                  onChange={(e) => setNewSimulation({ ...newSimulation, description: e.target.value })}
                  placeholder="Testing momentum strategy..."
                />
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createSimulation}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {simulations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">No simulations yet</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              Create your first simulation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {simulations.map((simulation) => (
            <Card 
              key={simulation.id} 
              className={simulation.isActive ? 'border-green-500' : ''}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white">
                      {simulation.name}
                    </CardTitle>
                    {simulation.description && (
                      <CardDescription className="text-gray-400">
                        {simulation.description}
                      </CardDescription>
                    )}
                  </div>
                  {simulation.isActive && (
                    <Badge className="bg-green-500 text-white">Active</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Balance</span>
                    <span className="font-medium text-white">
                      ${simulation.balance.toFixed(2)}
                    </span>
                  </div>
                  
                  {simulation.strategyConfigs && simulation.strategyConfigs.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Active Strategies</span>
                      <span className="font-medium text-white">
                        {simulation.strategyConfigs.filter(s => s.enabled).map(s => s.name).join(', ')}
                      </span>
                    </div>
                  )}
                  
                  {simulation.performanceStats && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total Trades</span>
                        <span className="font-medium text-white">
                          {simulation.performanceStats.totalTrades}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Win Rate</span>
                        <span className="font-medium text-white">
                          {(simulation.performanceStats.winRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total P&L</span>
                        <span className={`font-medium ${
                          simulation.performanceStats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          ${simulation.performanceStats.totalPnL.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                  
                  <div className="pt-3 flex gap-2">
                    {!simulation.isActive && (
                      <Button
                        size="sm"
                        onClick={() => activateSimulation(simulation.id)}
                        className="flex-1"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Activate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/dashboard/strategies')}
                      className={simulation.isActive ? 'flex-1' : ''}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                    {!simulation.isActive && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteSimulation(simulation.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
