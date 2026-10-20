/**
 * Main SME dashboard. Composition only: data comes from hooks, rendering
 * from components. No fetch calls or business rules live here.
 */
import Head from 'next/head';
import StatusBanner from '@/components/StatusBanner';
import ActionCard from '@/components/ActionCard';
import ChatWindow from '@/components/ChatWindow';
import IncidentTimeline from '@/components/IncidentTimeline';
import DemoControl from '@/components/DemoControl';
import useRealtimeAlert from '@/hooks/useRealtimeAlert';
import useChat from '@/hooks/useChat';
import useIncidentActions from '@/hooks/useIncidentActions';
import useTheme from '@/hooks/useTheme';
import useStatusMoment from '@/hooks/useStatusMoment';
import useSpotlight from '@/hooks/useSpotlight';
import useProtectionStats from '@/hooks/useProtectionStats';
import TopBar from '@/components/TopBar';
import ProtectionStatus from '@/components/ProtectionStatus';
import MomentOverlay from '@/components/MomentOverlay';
import { api } from '@/lib/api';
import { DEMO_MODE } from '@/lib/config';
import { bannerTone, isActiveIncident } from '@/lib/incident';
import { useI18n } from '@/lib/i18n';

export default function Dashboard() {
  const { state, loaded, connected, deliveredMs, error: linkError, transport } = useRealtimeAlert();
  const { t, lang } = useI18n();
  const chat = useChat(state, lang);
  const actions = useIncidentActions();
  const theme = useTheme();
  const moment = useStatusMoment(state, loaded);
  const stats = useProtectionStats(state.phase);
  useSpotlight();

  const active = isActiveIncident(state);
  const tone = bannerTone(state);
  // Changes once per breach: drives the chat auto-focus.
  const focusKey = state.phase === 'FIX' ? state.incident?.id : null;

  return (
    <div className={`app app--${tone}`}>
      <Head>
        <title>{tone === 'alarm' ? t('title.alarm') : t('title.normal')}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={theme.resolved === 'dark' ? '#070a12' : '#eef1f7'} />
      </Head>

      {/* Soft colour backdrop behind the glass; its tint follows the security status */}
      <div className="backdrop" aria-hidden="true">
        <span className="blob blob--a" />
        <span className="blob blob--b" />
        <span className="blob blob--c" />
      </div>

      <TopBar
        connected={connected}
        transport={transport}
        themePreference={theme.preference}
        onThemeChange={theme.setPreference}
      />

      <MomentOverlay moment={moment} />

      <StatusBanner state={state} shake={moment?.type === 'breach'} />

      {linkError && !connected && (
        <p className="link-warning" role="alert">
          {t(linkError)}
        </p>
      )}

      <main className="layout">
        <div className="layout__primary">
          {state.incident && state.phase !== 'MONITORING' ? (
            <ActionCard
              state={state}
              busy={actions.busy}
              error={actions.error}
              onConfirm={actions.confirmStep}
              onAcknowledge={actions.acknowledgeLearn}
              onMitigate={actions.applyMitigation}
              onEscalate={actions.escalate}
            />
          ) : (
            <ProtectionStatus connected={connected} stats={stats} />
          )}
          <IncidentTimeline incident={state.incident} />
        </div>

        <ChatWindow
          messages={chat.messages}
          onSend={chat.send}
          isLoading={chat.isLoading}
          focusKey={focusKey}
          isActive={active}
        />
      </main>

      {DEMO_MODE && (
        <DemoControl
          loadScenarios={api.listScenarios}
          onSimulate={actions.simulate}
          onReset={actions.reset}
          busy={actions.busy}
          deliveredMs={deliveredMs}
          hasIncident={active}
        />
      )}
    </div>
  );
}
