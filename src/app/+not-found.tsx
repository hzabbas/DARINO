import { router } from 'expo-router';

import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';

export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState
        icon="compass-outline"
        title="صفحه پیدا نشد"
        message="این آدرس در دارینو وجود ندارد."
        actionLabel="بازگشت به داشبورد"
        onActionPress={() => router.replace('/')}
      />
    </Screen>
  );
}
