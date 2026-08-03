import { Button, Card, CardHeader, CardTitle, StatusPill, StarRating } from "@ride-it/ui";

export default function RideDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Ride #{params.id}</h1>
          <p className="mt-1 text-sm text-ink-soft">Banjara Hills → Hitech City · Auto</p>
        </div>
        <StatusPill tone="alert">Disputed</StatusPill>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Passenger</dt>
              <dd className="text-ink">Kavya N.</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Driver</dt>
              <dd className="text-ink">Suresh P.</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Fare</dt>
              <dd className="font-meter text-ink">₹65</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Payment method</dt>
              <dd className="text-ink">Cash</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passenger complaint</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-soft">
            &ldquo;Driver took a longer route than necessary and the fare felt
            higher than expected.&rdquo;
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Passenger rated:</span>
            <StarRating value={2} readOnly size={16} />
          </div>
        </Card>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="outline">Issue partial refund</Button>
        <Button variant="destructive">Flag driver for review</Button>
        <Button>Mark resolved</Button>
      </div>
    </div>
  );
}
