package store

import (
	"fmt"
	"strings"
)

func nodeTag(node map[string]any) string {
	tag, _ := node["tag"].(string)
	return strings.TrimSpace(tag)
}

func (s *Store) FindNode(tag string) (map[string]any, int, bool) {
	nodes, _ := s.LoadNodes()
	for i, node := range nodes {
		if nodeTag(node) == tag {
			return node, i, true
		}
	}
	return nil, -1, false
}

func (s *Store) UpsertNode(node map[string]any) error {
	tag := nodeTag(node)
	if tag == "" {
		return fmt.Errorf("节点 tag 不能为空")
	}
	nodes, _ := s.LoadNodes()
	for i, existing := range nodes {
		if nodeTag(existing) == tag {
			nodes[i] = node
			return s.SaveNodes(nodes)
		}
	}
	nodes = append(nodes, node)
	return s.SaveNodes(nodes)
}

func (s *Store) DeleteNodes(tags []string) error {
	if len(tags) == 0 {
		return nil
	}
	remove := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		remove[tag] = struct{}{}
	}
	nodes, _ := s.LoadNodes()
	out := make([]map[string]any, 0, len(nodes))
	for _, node := range nodes {
		if _, ok := remove[nodeTag(node)]; ok {
			continue
		}
		out = append(out, node)
	}
	return s.SaveNodes(out)
}

func (s *Store) AddNodes(newNodes []map[string]any) error {
	nodes, _ := s.LoadNodes()
	existing := make(map[string]struct{}, len(nodes))
	for _, node := range nodes {
		existing[nodeTag(node)] = struct{}{}
	}
	for _, node := range newNodes {
		tag := nodeTag(node)
		if tag == "" {
			continue
		}
		if _, ok := existing[tag]; ok {
			for i, old := range nodes {
				if nodeTag(old) == tag {
					nodes[i] = node
					break
				}
			}
			continue
		}
		nodes = append(nodes, node)
		existing[tag] = struct{}{}
	}
	return s.SaveNodes(nodes)
}
