export function VehicleTripSummary({ result, t }: { result: { personHours: number; vehicleKilometers: number | null; participantCount: number; plannedParticipantCount: number; complete: boolean }; t: (key: string) => string }) {
  return <section aria-label={t('vehicleTripSummary')}>
    <h3>{t('vehicleTripSummary')}</h3>
    <dl>
      <dt>{t('vehiclePersonHours')}</dt><dd>{Number(result.personHours.toFixed(3))}</dd>
      <dt>{t('vehicleKilometers')}</dt><dd>{result.vehicleKilometers === null ? t('vehicleDistanceUnknown') : `${result.vehicleKilometers} km · ${t('vehicleEstimated')}`}</dd>
      <dt>{t('vehicleParticipants')}</dt><dd>{result.participantCount} / {result.plannedParticipantCount}</dd>
    </dl>
    {!result.complete && <p role="status">{t('vehicleIncomplete')}</p>}
    <p>{t('vehicleTimeNote')}</p>
  </section>;
}
