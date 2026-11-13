import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '../../components/AppText';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TransactionForm } from '../../components/TransactionForm';
import { getTransactionWithCategory } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';

export default function EditTransactionScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);

  const { data, loaded } = useDbQuery(
    (db) => (Number.isFinite(transactionId) ? getTransactionWithCategory(db, transactionId) : null),
    [transactionId],
  );

  if (!loaded) {
    return <Screen scroll={false}>{null}</Screen>;
  }

  if (!data) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="تراکنش پیدا نشد"
          message="این تراکنش حذف شده یا وجود ندارد."
          actionLabel="بازگشت به داشبورد"
          onActionPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            <AppText variant="title">ویرایش تراکنش</AppText>
            <AppText variant="caption" style={styles.headerSubtitle}>
              مبلغ، دسته‌بندی، تاریخ یا توضیحات را تغییر بده
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="بستن"
            hitSlop={8}
            onPress={handleClose}
            style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <TransactionForm mode="edit" transaction={data} onSaved={handleClose} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTexts: {
    flex: 1,
    minWidth: 0,
  },
  headerSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
});
