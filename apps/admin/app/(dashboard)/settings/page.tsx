"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, StatusPill } from "@ride-it/ui";
import { VehicleType } from "@ride-it/types";
import { FARE_RATES } from "@ride-it/utils";

export default function SettingsPage() {
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ink">Settings</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Platform-wide configuration. Changes here affect all Passenger and Driver apps.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs text-ink-soft">Base fare + per-km. No surge pricing.</p>
          <div className="space-y-3">
            {(Object.values(VehicleType) as VehicleType[]).map((type) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-ink">{type === VehicleType.BIKE ? "Bike" : "Auto"}</span>
                <span className="font-meter text-ink-soft">
                  ₹{FARE_RATES[type].baseFare} base + ₹{FARE_RATES[type].perKm}/km
                </span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-4">
            Edit pricing
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance mode</CardTitle>
            <StatusPill tone={maintenanceMode ? "alert" : "online"}>
              {maintenanceMode ? "Enabled" : "Disabled"}
            </StatusPill>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Temporarily blocks new bookings across Passenger and Driver apps
            during planned downtime.
          </p>
          <Button
            size="sm"
            variant={maintenanceMode ? "outline" : "destructive"}
            className="mt-4"
            onClick={() => setMaintenanceMode((v) => !v)}
          >
            {maintenanceMode ? "Turn off maintenance mode" : "Turn on maintenance mode"}
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            Configure push/SMS templates for ride status, subscription
            expiry, and promotional messages.
          </p>
          <Button size="sm" variant="outline" className="mt-4">
            Manage templates
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App versions</CardTitle>
          </CardHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">Passenger app</span>
              <span className="font-meter text-ink">v1.4.2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Driver app</span>
              <span className="font-meter text-ink">v1.3.0</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Languages</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            English is currently the only supported language. Supported
            language list is pending confirmation — see open PRD gaps.
          </p>
        </Card>
      </div>
    </div>
  );
}
