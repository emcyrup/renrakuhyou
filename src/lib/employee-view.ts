import { loadSettings } from './app-settings';
import { dayRangeUtc, displayDate } from './day';
import { formatDateTime } from './format';
import * as repo from './repo';
import type { AttendanceKind, Employee, MessageLevel, ReportCategory } from './types';
import { REPORT_CATEGORY_LABELS } from './types';
import { getWeather, type WeatherView } from './weather';
import { isAiConfigured } from './ai';

/**
 * 従業員本人の受付画面に渡すデータ。
 * 画面（クライアント側）と更新用 API の両方がこの形を使う。
 * 本人宛の連絡だけを入れる（他人の連絡は含めない）。
 */
export interface EmployeeDeliveryView {
  id: number;
  ackToken: string;
  title: string;
  /** 点呼で読み上げるため、本文も渡す（本人宛の連絡のみ）。 */
  body: string;
  level: MessageLevel;
  sentAt: string | null;
  acknowledgedAt: string | null;
}

export interface DispatchView {
  id: number;
  vehicleNo: string;
  route: string;
  note: string;
  mine: boolean;
  employeeName: string | null;
}

export interface SharedReportView {
  id: number;
  category: ReportCategory;
  body: string;
  urgent: boolean;
  /** 確認者が対応済みにしたか（対応済みなら画面の警告表示を解除する）。 */
  handled: boolean;
  employeeName: string;
  createdAt: string;
  mine: boolean;
}

export interface EmployeeSnapshot {
  name: string;
  companyName: string;
  oneWord: string;
  date: string;
  deliveries: EmployeeDeliveryView[];
  dispatches: DispatchView[];
  reports: SharedReportView[];
  attendance: { kind: AttendanceKind; at: string } | null;
  registeredDevices: number;
  weather: WeatherView | null;
  aiEnabled: boolean;
}

export async function buildEmployeeSnapshot(employee: Employee): Promise<EmployeeSnapshot> {
  const settings = loadSettings();
  const today = displayDate();

  const latest = repo.latestAttendance(employee.id);

  return {
    name: employee.name,
    companyName: settings.companyName,
    oneWord: settings.oneWord,
    date: today,
    deliveries: repo.listDeliveriesForEmployee(employee.id).map((delivery) => ({
      id: delivery.id,
      ackToken: delivery.ack_token,
      title: delivery.message_title,
      body: delivery.message_body,
      level: delivery.message_level,
      sentAt: delivery.sent_at,
      acknowledgedAt: delivery.acknowledged_at,
    })),
    dispatches: repo.listDispatches(today).map((dispatch) => ({
      id: dispatch.id,
      vehicleNo: dispatch.vehicle_no,
      route: dispatch.route,
      note: dispatch.note,
      mine: dispatch.employee_id === employee.id,
      employeeName: dispatch.employee_name,
    })),
    reports: repo.listSharedReports(8).map((report) => ({
      id: report.id,
      category: report.category,
      body: report.body,
      urgent: report.urgent === 1,
      handled: report.handled_at !== null,
      employeeName: report.employee_name,
      createdAt: report.created_at,
      mine: report.employee_id === employee.id,
    })),
    attendance: latest ? { kind: latest.kind, at: latest.created_at } : null,
    registeredDevices: repo.listPushSubscriptions(employee.id).length,
    weather: await getWeather(settings.weatherAreaCode),
    aiEnabled: isAiConfigured(),
  };
}

/** AI に渡す「今の状況」。従業員が今日置かれている状況だけを短くまとめる。 */
export function buildAiContext(snapshot: EmployeeSnapshot): string {
  const lines: string[] = [`今日は ${snapshot.date} です。`];

  if (snapshot.weather) {
    const temps = [
      snapshot.weather.high === null ? null : `最高 ${snapshot.weather.high}℃`,
      snapshot.weather.low === null ? null : `最低 ${snapshot.weather.low}℃`,
    ].filter(Boolean);
    lines.push(`天気: ${snapshot.weather.text}${temps.length > 0 ? `（${temps.join(' / ')}）` : ''}`);
  }

  if (snapshot.oneWord) lines.push(`今日のひとこと: ${snapshot.oneWord}`);

  const mine = snapshot.dispatches.filter((dispatch) => dispatch.mine);
  if (mine.length > 0) {
    lines.push(`この方の今日の配車: ${mine.map((d) => `${d.vehicleNo} ${d.route}${d.note ? `（${d.note}）` : ''}`).join(' / ')}`);
  }

  const unacknowledged = snapshot.deliveries.filter((delivery) => !delivery.acknowledgedAt);
  if (unacknowledged.length > 0) {
    lines.push(`未確認の連絡（${unacknowledged.length} 件）: ${unacknowledged.map((d) => d.title).join(' / ')}`);
  }

  if (snapshot.reports.length > 0) {
    lines.push(
      `仲間からの最近の報告: ${snapshot.reports
        .slice(0, 5)
        .map((report) => `${REPORT_CATEGORY_LABELS[report.category]}「${report.body}」`)
        .join(' / ')}`,
    );
  }

  if (snapshot.attendance) {
    lines.push(
      `直近の点呼: ${snapshot.attendance.kind === 'in' ? '出勤' : '退勤'}（${formatDateTime(snapshot.attendance.at)}）`,
    );
  }

  return lines.join('\n');
}

/** 確認者の画面で使う「今日の点呼」。 */
export function todayAttendance() {
  const [from, to] = dayRangeUtc();
  return repo.listAttendanceBetween(from, to);
}
