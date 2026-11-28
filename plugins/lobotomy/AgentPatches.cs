using System.Collections.Generic;
using System.Reflection;
using Harmony;

namespace AtelierLobotomyTweaks
{
    public static class AgentPatches
    {
        private static readonly FieldInfo IsDeadField = AccessTools.Field(typeof(UnitModel), "_isDead");
        private static readonly FieldInfo DeadInitField = AccessTools.Field(typeof(AgentModel), "deadInit");
        private static List<EquipmentModel> _savedEquipmentBackup = new List<EquipmentModel>();

        private static bool IsAgentDead(AgentModel agent)
        {
            if (agent == null) return false;
            if (IsDeadField != null && IsDeadField.GetValue(agent) is bool b) return b;
            return agent.hp <= 0;
        }

        private static void SetAgentAlive(AgentModel agent)
        {
            if (agent == null) return;
            IsDeadField?.SetValue(agent, false);
            DeadInitField?.SetValue(agent, false);
            agent.hp = agent.maxHp;
            agent.mental = agent.maxMental;
        }

        public static bool AddPermantelyDeleteAgent_Prefix() => false;

        public static bool OnReleaseWeapon_Prefix(AgentModel __instance) =>
            __instance == null || !IsAgentDead(__instance);

        public static bool OnReleaseArmor_Prefix(AgentModel __instance) =>
            __instance == null || !IsAgentDead(__instance);

        public static void OnStageEnd_Postfix() => ReviveAllAgents();

        public static void DeployAgentList_Init_Postfix() => ReviveAllAgents();

        private static void ReviveAllAgents()
        {
            IList<AgentModel> agents = AgentManager.instance?.GetAgentList();
            if (agents == null) return;
            foreach (AgentModel agent in agents)
            {
                if (IsAgentDead(agent)) SetAgentAlive(agent);
            }
        }

        public static void InventoryInit_Prefix()
        {
            if (InventoryModel.Instance?.equipList != null)
            {
                _savedEquipmentBackup = new List<EquipmentModel>(InventoryModel.Instance.equipList);
            }
        }

        public static void InventoryInit_Postfix()
        {
            if (InventoryModel.Instance == null || _savedEquipmentBackup == null || _savedEquipmentBackup.Count == 0) return;
            List<EquipmentModel> currentList = InventoryModel.Instance.equipList;
            if (currentList == null) return;
            foreach (EquipmentModel equip in _savedEquipmentBackup)
            {
                if (equip != null && InventoryModel.Instance.GetEquipment(equip.instanceId) == null)
                {
                    currentList.Add(equip);
                }
            }
        }
    }
}
