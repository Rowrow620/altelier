using System.Collections.Generic;
using Harmony;

namespace AtelierLobotomyTweaks
{
    public static class LobAndEgoPatches
    {
        [HarmonyPriority(Priority.First)]
        public static bool EnoughCheck_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool Pay_Prefix(ref bool __result)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            __result = true;
            return false;
        }

        public static void LoadData_Postfix()
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
        }

        public static void DeployUI_Update_Postfix(DeployUI __instance)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            if (__instance != null && __instance.pointCount != null) __instance.pointCount.text = "\u221E";
        }

        [HarmonyPriority(Priority.Last)]
        public static void GetHireText_Postfix(bool isEnter, ref string __result)
        {
            if (isEnter)
            {
                __result = "LOB 1";
                return;
            }
            string hireStr = "Hire";
            try
            {
                if (LocalizeTextDataModel.instance != null) hireStr = LocalizeTextDataModel.instance.GetText("Hire");
            }
            catch { }
            __result = hireStr + " (\u221E)";
        }

        [HarmonyPriority(Priority.First)]
        public static bool BuyAgent_Prefix(DeployUI __instance)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            __instance?.OpenCustomizingWindow();
            return false;
        }

        public static void DeployAgentList_Update_Postfix(DeployAgentList __instance)
        {
            if (__instance != null && __instance.HireText != null && DeployUI.instance != null)
            {
                __instance.HireText.text = DeployUI.instance.GetHireText(false);
            }
        }

        [HarmonyPriority(Priority.First)]
        public static bool CheckEquipmentCount_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        public static void GetEquipCount_Postfix(ref int __2) => __2 = 999;

        public static void EquipmentTypeList_Init_Postfix(EquipmentTypeList __instance)
        {
            IList<EquipmentTypeInfo> list = __instance?.GetAllData();
            if (list == null) return;
            foreach (EquipmentTypeInfo info in list)
            {
                if (info != null) info.maxNum = 999;
            }
        }

        [HarmonyPriority(Priority.First)]
        public static bool GetObserveState_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool GetObservationLevel_Prefix(ref int __result)
        {
            __result = 4;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool CheckRequire_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }
    }
}
