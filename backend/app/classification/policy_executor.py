import re
from typing import Dict, Any, List

class PolicyExecutor:
    @staticmethod
    def evaluate_policies(
        column_name: str,
        data_type: str,
        samples: List[str],
        current_sensitivity: str,
        current_tags: List[str],
        policies: List[Any]
    ) -> tuple:
        """
        Evaluates active policies on a column.
        Returns a tuple: (updated_sensitivity, updated_tags, triggered_policy_names)
        """
        sensitivity = current_sensitivity
        tags = list(current_tags) if current_tags else []
        triggered_policies = []

        for policy in policies:
            if not getattr(policy, "is_active", True):
                continue

            conditions = policy.conditions or {}
            actions = policy.actions or {}
            match = True

            # Condition 1: Column name substring check
            if "column_name_like" in conditions:
                val = conditions["column_name_like"].lower()
                if val not in column_name.lower():
                    match = False

            # Condition 2: Column name exact match
            if "column_name_equals" in conditions:
                val = conditions["column_name_equals"].lower()
                if val != column_name.lower():
                    match = False

            # Condition 3: Data type check
            if "data_type" in conditions:
                val = conditions["data_type"].lower()
                if val not in data_type.lower():
                    match = False

            # Condition 4: Sample values regex check
            if "sample_matches" in conditions:
                pattern = conditions["sample_matches"]
                sample_match = False
                try:
                    compiled = re.compile(pattern, re.IGNORECASE)
                    for sample in samples:
                        if sample and compiled.search(str(sample)):
                            sample_match = True
                            break
                except Exception:
                    pass
                if not sample_match:
                    match = False

            if match:
                triggered_policies.append(policy.name)
                # Apply actions
                if "set_sensitivity" in actions:
                    sensitivity = actions["set_sensitivity"]
                if "apply_tag" in actions:
                    tag_to_apply = actions["apply_tag"]
                    if tag_to_apply not in tags:
                        tags.append(tag_to_apply)
                if "apply_tags" in actions:
                    for tag in actions["apply_tags"]:
                        if tag not in tags:
                            tags.append(tag)

        return sensitivity, tags, triggered_policies

    @staticmethod
    def check_compliance(
        column_name: str,
        data_type: str,
        samples: List[str],
        actual_sensitivity: str,
        actual_tags: List[str],
        actual_regulatory_tags: List[str],
        policies: List[Any]
    ) -> List[Dict[str, Any]]:
        """
        Checks compliance of a column against active policies.
        Returns a list of compliance reports (one per matched policy):
        {
            "policy_id": "...",
            "policy_name": "...",
            "group_name": "...",
            "is_compliant": True/False,
            "explanation": "...",
            "remediation_steps": "..."
        }
        """
        reports = []
        actual_tags_set = set(actual_tags or []) | set(actual_regulatory_tags or [])
        
        sensitivity_ranks = {
            "Public": 1,
            "Internal": 2,
            "Confidential": 3,
            "Restricted": 4,
            "Critical": 5
        }
        
        actual_rank = sensitivity_ranks.get(actual_sensitivity or "Internal", 2)
        
        for policy in policies:
            if not getattr(policy, "is_active", True):
                continue
                
            conditions = policy.conditions or {}
            actions = policy.actions or {}
            match = True
            
            # Condition 1: Column name substring check
            if "column_name_like" in conditions:
                val = conditions["column_name_like"].lower()
                if val not in column_name.lower():
                    match = False
                    
            # Condition 2: Column name exact match
            if "column_name_equals" in conditions:
                val = conditions["column_name_equals"].lower()
                if val != column_name.lower():
                    match = False
                    
            # Condition 3: Data type check
            if "data_type" in conditions:
                val = conditions["data_type"].lower()
                if val not in data_type.lower():
                     match = False
                     
            # Condition 4: Sample values regex check
            if "sample_matches" in conditions:
                pattern = conditions["sample_matches"]
                sample_match = False
                try:
                    compiled = re.compile(pattern, re.IGNORECASE)
                    for sample in samples:
                        if sample and compiled.search(str(sample)):
                            sample_match = True
                            break
                except Exception:
                    pass
                if not sample_match:
                    match = False
                    
            if match:
                # The policy conditions matched. Now, check if classification respects policy actions.
                policy_violations = []
                
                # Check sensitivity level
                if "set_sensitivity" in actions:
                    req_sens = actions["set_sensitivity"]
                    req_rank = sensitivity_ranks.get(req_sens, 2)
                    if actual_rank < req_rank:
                        policy_violations.append(
                            f"Sensitivity is '{actual_sensitivity}', but policy requires '{req_sens}'"
                        )
                        
                # Check required tags
                req_tags = []
                if "apply_tag" in actions:
                    req_tags.append(actions["apply_tag"])
                if "apply_tags" in actions:
                    req_tags.extend(actions["apply_tags"])
                    
                for tag in req_tags:
                    if tag not in actual_tags_set:
                        policy_violations.append(f"Missing required security tag '{tag}'")
                        
                is_compliant = len(policy_violations) == 0
                
                explanation = ""
                remediation = ""
                if is_compliant:
                    explanation = f"Complies with policy '{policy.name}'."
                else:
                    explanation = f"Non-compliant: {', '.join(policy_violations)}."
                    # Build remediation steps
                    steps = []
                    if "set_sensitivity" in actions:
                        steps.append(f"override sensitivity level to '{actions['set_sensitivity']}'")
                    if req_tags:
                        formatted_tags = [f'"{t}"' for t in req_tags]
                        steps.append(f"apply tag(s) {', '.join(formatted_tags)}")
                    remediation = "To become compliant, please " + " and ".join(steps) + "."
                    
                reports.append({
                    "policy_id": policy.id,
                    "policy_name": policy.name,
                    "group_name": getattr(policy, "group_name", "Custom"),
                    "is_compliant": is_compliant,
                    "explanation": explanation,
                    "remediation_steps": remediation
                })
                
        return reports
