import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, tabBarHeight, useTheme } from '../../theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          height: tabBarHeight + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.icon,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'داشبورد',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'ثبت تراکنش',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={24}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: 'دسته‌بندی‌ها',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pricetags' : 'pricetags-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'گزارش و تحلیل',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'pie-chart' : 'pie-chart-outline'}
              size={22}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 2,
  },
  icon: {
    marginTop: 2,
  },
});
