import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BiChevronDown, BiChevronUp } from 'react-icons/bi';
import { ProviderConfig, CustomApiConfig } from '~services/user-config';
import BotIcon from '../BotIcon';
import Blockquote from './Blockquote';
import { cx } from '~/utils';

interface Props {
  providers: ProviderConfig[];
  bots: CustomApiConfig[];
}

const ROW_H = 32;
const ROW_GAP = 6;
const COL_HEADER_H = 22;

type HoverTarget =
  | { kind: 'provider'; id: string }
  | { kind: 'bot'; index: number }
  | null;

const RelationshipMap: FC<Props> = ({ providers, bots }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<HoverTarget>(null);

  const providerIndexById = useMemo(() => {
    const m = new Map<string, number>();
    providers.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [providers]);

  const links = useMemo(() => {
    return bots.map((bot, botIdx) => {
      const providerIdx =
        bot.providerRefId !== undefined ? providerIndexById.get(bot.providerRefId) : undefined;
      return {
        botIdx,
        providerId: bot.providerRefId,
        providerIdx: providerIdx ?? -1,
      };
    });
  }, [bots, providerIndexById]);

  const usageByProviderId = useMemo(() => {
    const map = new Map<string, number[]>();
    bots.forEach((bot, idx) => {
      if (!bot.providerRefId) return;
      const list = map.get(bot.providerRefId) ?? [];
      list.push(idx);
      map.set(bot.providerRefId, list);
    });
    return map;
  }, [bots]);

  const rowCount = Math.max(providers.length, bots.length, 1);
  const innerH = rowCount * ROW_H + (rowCount - 1) * ROW_GAP;

  const yOf = (i: number) => i * (ROW_H + ROW_GAP) + ROW_H / 2;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isProviderActive = (providerId: string): boolean => {
    if (!hover) return false;
    if (hover.kind === 'provider') return hover.id === providerId;
    if (hover.kind === 'bot') {
      const bot = bots[hover.index];
      return bot?.providerRefId === providerId;
    }
    return false;
  };

  const isBotActive = (botIdx: number): boolean => {
    if (!hover) return false;
    if (hover.kind === 'bot') return hover.index === botIdx;
    if (hover.kind === 'provider') {
      const bot = bots[botIdx];
      return bot?.providerRefId === hover.id;
    }
    return false;
  };

  const isLinkActive = (link: { botIdx: number; providerId?: string }): boolean => {
    if (!hover) return false;
    if (hover.kind === 'bot') return hover.index === link.botIdx;
    if (hover.kind === 'provider') return link.providerId === hover.id;
    return false;
  };

  return (
    <div className="p-4 rounded-lg bg-white/20 dark:bg-black/20 border border-gray-300 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-md font-semibold">{t('Provider–Chatbot Relationships')}</h3>
          <span className="text-xs opacity-60 truncate">
            {t('{{p}} providers / {{b}} chatbots', { p: providers.length, b: bots.length })}
          </span>
        </div>
        {expanded ? <BiChevronUp size={18} /> : <BiChevronDown size={18} />}
      </button>

      {expanded && (
        <>
          <Blockquote className="mt-2">
            {t('Provider defines shared API infrastructure (host, authentication). Chatbot defines per-model behavior (model, parameters, system prompt). One provider can be referenced by multiple chatbots.')}
          </Blockquote>
          <p className="mt-1.5 text-xs opacity-70">
            {t('Hover a row to highlight related items. Click to jump to its settings.')}
          </p>

          <div className="mt-3 flex gap-2">
            {/* Provider column */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide opacity-60 mb-1" style={{ height: COL_HEADER_H }}>
                {t('API Providers')}
              </p>
              <div className="flex flex-col" style={{ gap: ROW_GAP, height: innerH }}>
                {providers.length === 0 && (
                  <div
                    className="flex items-center justify-center text-xs opacity-50 italic border border-dashed border-gray-400 dark:border-gray-600 rounded"
                    style={{ height: ROW_H }}
                  >
                    {t('No providers configured')}
                  </div>
                )}
                {providers.map((p, i) => {
                  const usage = usageByProviderId.get(p.id) ?? [];
                  const active = isProviderActive(p.id);
                  const unused = usage.length === 0;
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHover({ kind: 'provider', id: p.id })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => scrollTo(`provider-setting-${i}`)}
                      title={t('Click to jump to settings')}
                      className={cx(
                        'flex items-center gap-2 px-2 rounded border cursor-pointer transition-colors',
                        active
                          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500'
                          : 'bg-white/40 dark:bg-black/30 border-gray-300 dark:border-gray-700 hover:bg-white/60 dark:hover:bg-black/40',
                      )}
                      style={{ height: ROW_H }}
                    >
                      <div className="w-5 h-5 flex-shrink-0">
                        <BotIcon iconName={p.icon} size={20} />
                      </div>
                      <span className="text-sm truncate flex-1">{p.name}</span>
                      {unused ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 opacity-70 flex-shrink-0">
                          {t('Unused')}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex-shrink-0">
                          ×{usage.length}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SVG bridge */}
            <div className="w-24 flex-shrink-0" style={{ paddingTop: COL_HEADER_H }}>
              <svg
                width="100%"
                height={innerH}
                viewBox={`0 0 100 ${innerH}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                {links.map((link) => {
                  if (link.providerIdx < 0) return null;
                  const y1 = yOf(link.providerIdx);
                  const y2 = yOf(link.botIdx);
                  const active = isLinkActive(link);
                  const d = `M 0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`;
                  return (
                    <path
                      key={`l-${link.botIdx}`}
                      d={d}
                      fill="none"
                      stroke={active ? '#3b82f6' : 'currentColor'}
                      strokeOpacity={active ? 1 : 0.35}
                      strokeWidth={active ? 2.2 : 1.4}
                      className={active ? '' : 'text-gray-500 dark:text-gray-400'}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Chatbot column */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide opacity-60 mb-1" style={{ height: COL_HEADER_H }}>
                {t('Chatbots')}
              </p>
              <div className="flex flex-col" style={{ gap: ROW_GAP, height: innerH }}>
                {bots.length === 0 && (
                  <div
                    className="flex items-center justify-center text-xs opacity-50 italic border border-dashed border-gray-400 dark:border-gray-600 rounded"
                    style={{ height: ROW_H }}
                  >
                    {t('No chatbots configured')}
                  </div>
                )}
                {bots.map((bot, i) => {
                  const active = isBotActive(i);
                  const standalone = !bot.providerRefId || providerIndexById.get(bot.providerRefId) === undefined;
                  return (
                    <div
                      key={i}
                      onMouseEnter={() => setHover({ kind: 'bot', index: i })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => scrollTo(`chatbot-setting-${i}`)}
                      title={t('Click to jump to settings')}
                      className={cx(
                        'flex items-center gap-2 px-2 rounded border cursor-pointer transition-colors',
                        active
                          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500'
                          : 'bg-white/40 dark:bg-black/30 border-gray-300 dark:border-gray-700 hover:bg-white/60 dark:hover:bg-black/40',
                      )}
                      style={{ height: ROW_H }}
                    >
                      <div className="w-5 h-5 flex-shrink-0">
                        <BotIcon iconName={bot.avatar} size={20} />
                      </div>
                      <span className="text-sm truncate flex-1">{bot.name}</span>
                      {standalone && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex-shrink-0"
                          title={t('This chatbot uses individual settings (no provider reference)')}
                        >
                          {t('Individual')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RelationshipMap;
