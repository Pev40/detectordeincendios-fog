// Navegación principal de la aplicación

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ActivityScreen from '../screens/ActivityScreen';

export type RootStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  Activity: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2196F3',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}>
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: 'Fire ID - Dashboard',
            headerRight: () => null,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Configuración',
          }}
        />
        <Stack.Screen
          name="Activity"
          component={ActivityScreen}
          options={{
            title: 'Actividad Reciente',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;

